/*
 * Copyright 2019-present Open Networking Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnChanges,
    OnInit,
    Output,
    QueryList,
    SimpleChange,
    SimpleChanges,
    ViewChildren
} from '@angular/core';

import {
    Device,
    DeviceProps,
    ForceDirectedGraph,
    Host,
    HostLabelToggle,
    LabelToggle,
    LayerType,
    Link,
    LinkHighlight,
    Location,
    ModelEventMemo,
    ModelEventType,
    Node,
    Options,
    Region,
    RegionLink,
    SubRegion,
    UiElement,
    LinkType,
    NodeType
} from './models';
import {LocationType} from '../backgroundsvg/backgroundsvg.component';
import {DeviceNodeSvgComponent} from './visuals/devicenodesvg/devicenodesvg.component';
import {HostNodeSvgComponent} from './visuals/hostnodesvg/hostnodesvg.component';
import {LinkSvgComponent} from './visuals/linksvg/linksvg.component';
import {SelectedEvent} from './visuals/nodevisual';
import { MetaUi, LogService, WebSocketService, ZoomUtils, LocMeta } from '../../../../../gui2-fw-lib/src/public_api';

interface UpdateMeta {
    id: string;
    class: string;
    memento: MetaUi;
}

const SVGCANVAS = <Options>{
    width: 1000,
    height: 1000
};

interface ChangeSummary {
    numChanges: number;
    locationChanged: boolean;
}

/**
 * ONOS GUI -- Topology Forces Graph Layer View.
 *
 * The regionData is set by Topology Service on WebSocket topo2CurrentRegion callback
 * This drives the whole Force graph
 */
@Component({
    selector: '[onos-forcesvg]',
    templateUrl: './forcesvg.component.html',
    styleUrls: ['./forcesvg.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForceSvgComponent implements OnInit, OnChanges {
    @Input() deviceLabelToggle: LabelToggle.Enum = LabelToggle.Enum.NONE;
    @Input() hostLabelToggle: HostLabelToggle.Enum = HostLabelToggle.Enum.NONE;
    @Input() showHosts: boolean = false;
    @Input() highlightPorts: boolean = true;
    @Input() onosInstMastership: string = '';
    @Input() visibleLayer: LayerType = LayerType.LAYER_DEFAULT;
    @Input() selectedLink: RegionLink = null;
    @Input() scale: number = 1;
    @Input() regionData: Region = <Region>{devices: [ [], [], [] ], hosts: [ [], [], [] ], links: []};
    @Output() linkSelected = new EventEmitter<RegionLink>();
    @Output() selectedNodeEvent = new EventEmitter<UiElement[]>();
    public graph: ForceDirectedGraph;
    private selectedNodes: UiElement[] = [];

    // References to the children of this component - these are created in the
    // template view with the *ngFor and we get them by a query here
    @ViewChildren(DeviceNodeSvgComponent) devices: QueryList<DeviceNodeSvgComponent>;
    @ViewChildren(HostNodeSvgComponent) hosts: QueryList<HostNodeSvgComponent>;
    @ViewChildren(LinkSvgComponent) links: QueryList<LinkSvgComponent>;

    constructor(
        protected log: LogService,
        private ref: ChangeDetectorRef,
        protected wss: WebSocketService
    ) {
        this.selectedLink = null;
        this.log.debug('ForceSvgComponent constructed');
    }

    /**
     * Utility for extracting a node name from an endpoint string
     * In some cases - have to remove the port number from the end of a device
     * name
     * @param endPtStr The end point name
     */
    static extractNodeName(endPtStr: string, portStr: string): string {
        if (portStr === undefined || endPtStr === undefined) {
            return endPtStr;
        } else if (endPtStr.includes('/')) {
            return endPtStr.substr(0, endPtStr.length - portStr.length - 1);
        }
        return endPtStr;
    }

    /**
     * Recursive method to compare 2 objects attribute by attribute and update
     * the first where a change is detected
     * @param existingNode 1st object
     * @param updatedNode 2nd object
     */
    private static updateObject(existingNode: Object, updatedNode: Object): ChangeSummary {
        const changed = <ChangeSummary>{numChanges: 0, locationChanged: false};
        for (const key of Object.keys(updatedNode)) {
            const o = updatedNode[key];
            if (['id', 'x', 'y', 'fx', 'fy', 'vx', 'vy', 'index'].some(k => k === key)) {
                continue;
            } else if (o && typeof o === 'object' && o.constructor === Object) {
                const subChanged = ForceSvgComponent.updateObject(existingNode[key], updatedNode[key]);
                changed.numChanges += subChanged.numChanges;
                changed.locationChanged = subChanged.locationChanged ? true : changed.locationChanged;
            } else if (existingNode === undefined) {
                // Copy the whole object
                existingNode = updatedNode;
                changed.locationChanged = true;
                changed.numChanges++;
            } else if (existingNode[key] !== updatedNode[key]) {
                if (['locType', 'latOrY', 'longOrX', 'latitude', 'longitude', 'gridX', 'gridY'].some(k => k === key)) {
                    changed.locationChanged = true;
                }
                changed.numChanges++;
                existingNode[key] = updatedNode[key];
            }
        }
        return changed;
    }

    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.graph.restartSimulation();
        this.log.debug('Simulation restart after resize', event);
    }

    /**
     * After the component is initialized create the Force simulation
     * The list of devices, hosts and links will not have been receieved back
     * from the WebSocket yet as this time - they will be updated later through
     * ngOnChanges()
     */
    ngOnInit() {
        // Receiving an initialized simulated graph from our custom d3 service
        this.graph = new ForceDirectedGraph(SVGCANVAS, this.log);

        /** Binding change detection check on each tick
         * This along with an onPush change detection strategy should enforce
         * checking only when relevant! This improves scripting computation
         * duration in a couple of tests I've made, consistently. Also, it makes
         * sense to avoid unnecessary checks when we are dealing only with
         * simulations data binding.
         */
        this.graph.ticker.subscribe((simulation) => {
            // this.log.debug("Force simulation has ticked. Alpha",
            //     Math.round(simulation.alpha() * 1000) / 1000);
            this.ref.markForCheck();
        });

        this.log.debug('ForceSvgComponent initialized - waiting for nodes and links');

        this.mock();

    }

    /**
     * When any one of the inputs get changed by a containing component, this
     * gets called automatically. In addition this is called manually by
     * topology.service when a response is received from the WebSocket from the
     * server
     *
     * The Devices, Hosts and SubRegions are all added to the Node list for the simulation
     * The Links are added to the Link list of the simulation.
     * Before they are added the Links are associated with Nodes based on their endPt
     *
     * @param changes - a list of changed @Input(s)
     */
    ngOnChanges(changes: SimpleChanges) {

        if (changes['regionData']) {
            const devices: Device[] =
                changes['regionData'].currentValue.devices[this.visibleLayerIdx()];
            const hosts: Host[] =
                changes['regionData'].currentValue.hosts[this.visibleLayerIdx()];
            const subRegions: SubRegion[] = changes['regionData'].currentValue.subRegion;
            this.graph.nodes = [];
            if (devices) {
                this.graph.nodes = devices;
            }
            if (hosts) {
                this.graph.nodes = this.graph.nodes.concat(hosts);
            }
            if (subRegions) {
                this.graph.nodes = this.graph.nodes.concat(subRegions);
            }

            this.graph.nodes.forEach((n) => this.fixPosition(n));

            // Associate the endpoints of each link with a real node
            this.graph.links = [];
            for (const linkIdx of Object.keys(this.regionData.links)) {
                const link = this.regionData.links[linkIdx];
                const epA = ForceSvgComponent.extractNodeName(link.epA, link.portA);
                if (!this.graph.nodes.find((node) => node.id === epA)) {
                    this.log.error('ngOnChange Could not find endpoint A', epA, 'for', link);
                    continue;
                }
                const epB = ForceSvgComponent.extractNodeName(
                    link.epB, link.portB);
                if (!this.graph.nodes.find((node) => node.id === epB)) {
                    this.log.error('ngOnChange Could not find endpoint B', epB, 'for', link);
                    continue;
                }
                this.regionData.links[linkIdx].source =
                    this.graph.nodes.find((node) =>
                        node.id === epA);
                this.regionData.links[linkIdx].target =
                    this.graph.nodes.find((node) =>
                        node.id === epB);
                this.regionData.links[linkIdx].index = Number(linkIdx);
            }

            this.graph.links = this.regionData.links;
            if (this.graph.nodes.length > 0) {
                this.graph.reinitSimulation();
            }
            this.log.debug('ForceSvgComponent input changed',
                this.graph.nodes.length, 'nodes,', this.graph.links.length, 'links');
        }
    }

    mock() {
        var d = []
        
        for(var i=0;i<28;i++){
            d[i] = new Device('d:000000000000'+i);
            d[i].online = true;
            d[i].type = 'switch'
            d[i].nodeType = NodeType.DEVICE
            d[i].master = '#50616d'
            d[i].location = []
            d[i].location.locType = LocationType.GRID
            d[i].rank = 0;
        }
        d[0].type = 'satellite'
        d[0].master = '#ca6924'
        d[0].rank = -1;
        var loc = [
            [0,0],
            [300,-350],
            [400,-350],
            [200,-275],
            [500,-275],
            [200,-200],
            [300,-200],
            [400,-200],
            [500,-200],
            [200,-125],
            [500,-125],
            [300,-50],
            [400,-50],

            [-400,-25],
            [-300,-25],
            [-200,-25],
            [-400,75],
            [-300,75],
            [-200,75],
            [-400,175],
            [-300,175],
            [-200,175],

            [300,200],
            [400,200],
            [500,200],
            [300,300],
            [400,300],
            [500,300],
        ]
        for(var i=0;i<loc.length;i++){
            d[i].location.longOrX = loc[i][0] + 500
            d[i].location.latOrY = loc[i][1] + 500
        }

        var l =[]

        var links = [
            [0,7],
            [0,11],
            [0,15],
            [0,17],
            [0,23],

            [1,2],
            [1,3],
            [2,4],
            [3,5],
            [1,6],
            [3,6],
            [5,6],
            [1,7],
            [2,7],
            [4,7],
            [6,7],
            [4,8],
            [7,8],
            [5,9],
            [6,9],
            [7,10],
            [8,10],
            [6,11],
            [7,11],
            [9,11],
            [7,12],
            [10,12],
            [11,12],

            [13,14],
            [14,15],
            [13,16],
            [13,17],
            [14,17],
            [15,17],
            [16,17],
            [15,18],
            [17,18],
            [16,19],
            [17,19],
            [19,20],
            [17,20],
            [17,21],
            [18,21],
            [20,21],

            [22,23],
            [23,24],
            [22,25],
            [22,26],
            [23,26],
            [24,26],
            [25,26],
            [24,27],
            [26,27],

            [3,14],
            [5,15],
            [10,24],
            [21,25]
            
        ]
        for(var i=0;i<links.length;i++){
            l[i] = new Link(d[links[i][0]],d[links[i][1]])
        }
        for(var i=0;i<=4;i++){
            l[i].rank = 'satellite'
        }
        for(var i=5;i<=52;i++){
            l[i].rank = 'microwave'
        }
        for(var i=53;i<=56;i++){
            l[i].rank = 'scattering'
        }

        



        // var l2 = new Link(d1,h1);
        // l2.epA = 'd:0000000000001'
        // l2.epB = 'h:0000000000001'
        // l2.type = LinkType.UiEdgeLink
        // var h1 = new Host('h:0000000000001')
        // h1.ips = ['192.168.0.1']
        // h1.nodeType = NodeType.HOST
        // this.handleModelEvent(ModelEventType.HOST_ADDED_OR_UPDATED,ModelEventMemo.ADDED,'',h1)

        var h = []
        var number = 4
        var l2 = []
        for(var i=4;i<28*number;i++){
            var j = Math.floor(i/number);
            var mod = i%number;
            h[i] = new Host('h:000000000000'+i);
            h[i].master = '#D3D3D3'
            h[i].online = true;
            h[i].type = 'endstation'
            h[i].nodeType = NodeType.HOST

            h[i].location = []
            h[i].ips=[]
            h[i].location.locType = LocationType.GRID
            var t1,t2;
            if(mod==0){
                t1 = 25;
                t2 = 25;
            }else if(mod==1){
                t1 = 25;
                t2 = -25;
            }else if(mod==2){
                t1 = -25;
                t2 = 25;
            }else{
                t1 = -25;
                t2 = -25;
            }
            h[i].location.longOrX = d[j].location.longOrX + t1;
            h[i].location.latOrY = d[j].location.latOrY + t2;

            h[i].rank = 1;

            l2[i] = new Link(d[j],h[i])
            l2[i].type = LinkType.UiEdgeLink
            l2[i].rank = 'temp'
            
        }
        for(var i=4;i<h.length;i++){
            this.handleModelEvent(ModelEventType.HOST_ADDED_OR_UPDATED,ModelEventMemo.ADDED,'',h[i])
        }
        for(var i=0;i<d.length;i++){
            this.handleModelEvent(ModelEventType.DEVICE_ADDED_OR_UPDATED,ModelEventMemo.ADDED,'',d[i])
        }
        for(var i=4;i<l2.length;i++){
            this.handleModelEvent(ModelEventType.LINK_ADDED_OR_UPDATED,ModelEventMemo.ADDED,'',l2[i])
        }
        for(var i=0;i<l.length;i++){
            this.handleModelEvent(ModelEventType.LINK_ADDED_OR_UPDATED,ModelEventMemo.ADDED,'',l[i])
        }
        
    }

    /**
     * If instance has a value then mute colors of devices not connected to it
     * Otherwise if instance does not have a value unmute all
     * @param instanceName name of the selected instance
     */
    changeInstSelection(instanceName: string) {
        this.log.debug('Mastership changed', instanceName);
        this.devices.filter((d) => d.device.master !== instanceName)
            .forEach((d) => {
                const isMuted = Boolean(instanceName);
                d.ngOnChanges({'colorMuted': new SimpleChange(!isMuted, isMuted, true)});
            }
        );
    }

    /**
     * If a node has a fixed location then assign it to fx and fy so
     * that it doesn't get affected by forces
     * @param graphNode The node whose location should be processed
     */
    private fixPosition(graphNode: Node): void {
        const loc: Location = <Location>graphNode['location'];
        const props: DeviceProps = <DeviceProps>graphNode['props'];
        const metaUi = <MetaUi>graphNode['metaUi'];
        if (loc && loc.locType === LocationType.GEO) {
            const position: MetaUi =
                ZoomUtils.convertGeoToCanvas(
                    <LocMeta>{lng: loc.longOrX, lat: loc.latOrY});
            graphNode.fx = position.x;
            graphNode.fy = position.y;
            this.log.debug('Found node', graphNode.id, 'with', loc.locType);
        } else if (loc && loc.locType === LocationType.GRID) {
            graphNode.fx = loc.longOrX;
            graphNode.fy = loc.latOrY;
            this.log.debug('Found node', graphNode.id, 'with', loc.locType);
        } else if (props && props.locType === LocationType.NONE && metaUi) {
            graphNode.fx = metaUi.x;
            graphNode.fy = metaUi.y;
            this.log.debug('Found node', graphNode.id, 'with locType=none and metaUi');
        } else {
            graphNode.fx = null;
            graphNode.fy = null;
        }
    }

    /**
     * Get the index of LayerType so it can drive the visibility of nodes and
     * hosts on layers
     */
    visibleLayerIdx(): number {
        const layerKeys: string[] = Object.keys(LayerType);
        for (const idx in layerKeys) {
            if (LayerType[layerKeys[idx]] === this.visibleLayer) {
                return Number(idx);
            }
        }
        return -1;
    }

    selectLink(link: RegionLink): void {
        this.selectedLink = link;
        this.linkSelected.emit(link);
    }

    /**
     * Iterate through all hosts and devices and links to deselect the previously selected
     * node. The emit an event to the parent that lets it know the selection has
     * changed.
     *
     * This function collates all of the nodes that have been selected and passes
     * a collection of nodes up to the topology component
     *
     * @param selectedNode the newly selected node
     */
    updateSelected(selectedNode: SelectedEvent): void {
        this.log.debug('Node or link ',
            selectedNode.uiElement ? selectedNode.uiElement.id : '--',
            selectedNode.deselecting ? 'deselected' : 'selected',
            selectedNode.isShift ? 'Multiple' : '');

        if (selectedNode.isShift && selectedNode.deselecting) {
            const idx = this.selectedNodes.findIndex((n) =>
                n.id === selectedNode.uiElement.id
            );
            this.selectedNodes.splice(idx, 1);
            this.log.debug('Removed node', idx);

        } else if (selectedNode.isShift) {
            this.selectedNodes.push(selectedNode.uiElement);

        } else if (selectedNode.deselecting) {
            this.devices
                .forEach((d) => d.deselect());
            this.hosts
                .forEach((h) => h.deselect());
            this.links
                .forEach((l) => l.deselect());
            this.selectedNodes = [];

        } else {
            const selNodeId = selectedNode.uiElement.id;
            // Otherwise if shift was not pressed deselect previous
            this.devices
                .filter((d) => d.device.id !== selNodeId)
                .forEach((d) => d.deselect());
            this.hosts
                .filter((h) => h.host.id !== selNodeId)
                .forEach((h) => h.deselect());

            this.links
                .filter((l) => l.link.id !== selNodeId)
                .forEach((l) => l.deselect());

            this.selectedNodes = [selectedNode.uiElement];
        }
        // Push the changes back up to parent (Topology Component)
        this.selectedNodeEvent.emit(this.selectedNodes);
    }

    /**
     * We want to filter links to show only those not related to hosts if the
     * 'showHosts' flag has been switched off. If 'showHosts' is true, then
     * display all links.
     */
    filteredLinks(): Link[] {
        return this.regionData.links.filter((h) =>
            this.showHosts ||
            ((<Host>h.source).nodeType !== 'host' &&
            (<Host>h.target).nodeType !== 'host'));
    }

    /**
     * When changes happen in the model, then model events are sent up through the
     * Web Socket
     * @param type - the type of the change
     * @param memo - a qualifier on the type
     * @param subject - the item that the update is for
     * @param data - the new definition of the item
     */
    handleModelEvent(type: ModelEventType, memo: ModelEventMemo, subject: string, data: UiElement): void {

        switch (type) {
            
            case ModelEventType.DEVICE_ADDED_OR_UPDATED:
                if (memo === ModelEventMemo.ADDED) {
                    this.fixPosition(<Device>data);
                    this.graph.nodes.push(<Device>data);
                    this.regionData.devices[this.visibleLayerIdx()].push(<Device>data);
                    this.log.debug('Device added', (<Device>data).id);
                } else if (memo === ModelEventMemo.UPDATED) {
                    const oldDevice: Device =
                        this.regionData.devices[this.visibleLayerIdx()]
                            .find((d) => d.id === subject);
                    const changes = ForceSvgComponent.updateObject(oldDevice, <Device>data);
                    if (changes.numChanges > 0) {
                        this.log.debug('Device ', oldDevice.id, memo, ' - ', changes, 'changes');
                        if (changes.locationChanged) {
                            this.fixPosition(oldDevice);
                        }
                        const svgDevice: DeviceNodeSvgComponent =
                            this.devices.find((svgdevice) => svgdevice.device.id === subject);
                        svgDevice.ngOnChanges({'device':
                                new SimpleChange(<Device>{}, oldDevice, true)
                        });
                    }
                } else {
                    this.log.warn('Device ', memo, ' - not yet implemented', data);
                }
                break;
            case ModelEventType.HOST_ADDED_OR_UPDATED:
                if (memo === ModelEventMemo.ADDED) {
                    this.fixPosition(<Host>data);
                    this.graph.nodes.push(<Host>data);
                    this.regionData.hosts[this.visibleLayerIdx()].push(<Host>data);
                    this.log.debug('Host added', (<Host>data).id);
                } else if (memo === ModelEventMemo.UPDATED) {
                    const oldHost: Host = this.regionData.hosts[this.visibleLayerIdx()]
                        .find((h) => h.id === subject);
                    const changes = ForceSvgComponent.updateObject(oldHost, <Host>data);
                    if (changes.numChanges > 0) {
                        this.log.debug('Host ', oldHost.id, memo, ' - ', changes, 'changes');
                        if (changes.locationChanged) {
                            this.fixPosition(oldHost);
                        }
                    }
                } else {
                    this.log.warn('Host change', memo, ' - unexpected');
                }
                break;
            case ModelEventType.DEVICE_REMOVED:
                if (memo === ModelEventMemo.REMOVED || memo === undefined) {
                    const removeIdx: number =
                        this.regionData.devices[this.visibleLayerIdx()]
                            .findIndex((d) => d.id === subject);
                    this.regionData.devices[this.visibleLayerIdx()].splice(removeIdx, 1);
                    this.removeRelatedLinks(subject);
                    this.log.debug('Device ', subject, 'removed. Links', this.regionData.links);
                } else {
                    this.log.warn('Device removed - unexpected memo', memo);
                }
                break;
            case ModelEventType.HOST_REMOVED:
                if (memo === ModelEventMemo.REMOVED || memo === undefined) {
                    const removeIdx: number =
                        this.regionData.hosts[this.visibleLayerIdx()]
                            .findIndex((h) => h.id === subject);
                    this.regionData.hosts[this.visibleLayerIdx()].splice(removeIdx, 1);
                    this.removeRelatedLinks(subject);
                    this.log.debug('Host ', subject, 'removed');
                } else {
                    this.log.warn('Host removed - unexpected memo', memo);
                }
                break;
            case ModelEventType.LINK_ADDED_OR_UPDATED:
                if (memo === ModelEventMemo.ADDED &&
                    this.regionData.links.findIndex((l) => l.id === subject) === -1) {
                    const newLink = <RegionLink>data;


                    const epA = ForceSvgComponent.extractNodeName(
                        newLink.epA, newLink.portA);
                    if (!this.graph.nodes.find((node) => node.id === epA)) {
                        this.log.error('Could not find endpoint A', epA, 'of', newLink);
                        break;
                    }
                    const epB = ForceSvgComponent.extractNodeName(
                        newLink.epB, newLink.portB);
                    if (!this.graph.nodes.find((node) => node.id === epB)) {
                        this.log.error('Could not find endpoint B', epB, 'of link', newLink);
                        break;
                    }

                    const listLen = this.regionData.links.push(<RegionLink>data);
                    this.regionData.links[listLen - 1].source =
                        this.graph.nodes.find((node) => node.id === epA);
                    this.regionData.links[listLen - 1].target =
                        this.graph.nodes.find((node) => node.id === epB);
                    this.log.debug('Link added', subject);
                } else if (memo === ModelEventMemo.UPDATED) {
                    const oldLink = this.regionData.links.find((l) => l.id === subject);
                    const changes = ForceSvgComponent.updateObject(oldLink, <RegionLink>data);
                    this.log.debug('Link ', subject, '. Updated', changes, 'items');
                } else {
                    this.log.warn('Link event ignored', subject, data);
                }
                break;
            case ModelEventType.LINK_REMOVED:
                if (memo === ModelEventMemo.REMOVED) {
                    const removeIdx = this.regionData.links.findIndex((l) => l.id === subject);
                    this.regionData.links.splice(removeIdx, 1);
                    this.log.debug('Link ', subject, 'removed');
                }
                break;
            default:
                this.log.error('Unexpected model event', type, 'for', subject, 'Data', data);
        }
        this.graph.links = this.regionData.links;
        this.graph.reinitSimulation();
    }

    private removeRelatedLinks(subject: string) {
        const len = this.regionData.links.length;
        for (let i = 0; i < len; i++) {
            const linkIdx = this.regionData.links.findIndex((l) =>
                (ForceSvgComponent.extractNodeName(l.epA, l.portA) === subject ||
                    ForceSvgComponent.extractNodeName(l.epB, l.portB) === subject));
            if (linkIdx >= 0) {
                this.regionData.links.splice(linkIdx, 1);
                this.log.debug('Link ', linkIdx, 'removed on attempt', i);
            }
        }
    }

    /**
     * When traffic monitoring is turned on (A key) highlights will be sent back
     * from the WebSocket through the Traffic Service
     * @param devices - an array of device highlights
     * @param hosts - an array of host highlights
     * @param links - an array of link highlights
     */
    handleHighlights(devices: Device[], hosts: Host[], links: LinkHighlight[], fadeMs: number = 0): void {

        if (devices.length > 0) {
            this.log.debug(devices.length, 'Devices highlighted');
            devices.forEach((dh) => {
                const deviceComponent: DeviceNodeSvgComponent = this.devices.find((d) => d.device.id === dh.id );
                if (deviceComponent) {
                    deviceComponent.ngOnChanges(
                        {'deviceHighlight': new SimpleChange(<Device>{}, dh, true)}
                    );
                    this.log.debug('Highlighting device', deviceComponent.device.id);
                } else {
                    this.log.warn('Device component not found', dh.id);
                }
            });
        }
        if (hosts.length > 0) {
            this.log.debug(hosts.length, 'Hosts highlighted');
            hosts.forEach((hh) => {
                const hostComponent: HostNodeSvgComponent = this.hosts.find((h) => h.host.id === hh.id );
                if (hostComponent) {
                    hostComponent.ngOnChanges(
                        {'hostHighlight': new SimpleChange(<Host>{}, hh, true)}
                    );
                    this.log.debug('Highlighting host', hostComponent.host.id);
                }
            });
        }
        if (links.length > 0) {
            this.log.debug(links.length, 'Links highlighted');
            links.forEach((lh) => {
                const linkComponent: LinkSvgComponent =
                    this.links.find((l) => l.link.id === Link.linkIdFromShowHighlights(lh.id) );
                if (linkComponent) { // A link might not be present if hosts viewing is switched off
                    if (fadeMs > 0) {
                        lh.fadems = fadeMs;
                    }
                    linkComponent.ngOnChanges(
                        {'linkHighlight': new SimpleChange(<LinkHighlight>{}, lh, true)}
                    );
                }
            });
        }
    }

    /**
     * As nodes are dragged around the graph, their new location should be sent
     * back to server
     * @param klass The class of node e.g. 'host' or 'device'
     * @param id - the ID of the node
     * @param newLocation - the new Location of the node
     */
    nodeMoved(klass: string, id: string, newLocation: MetaUi) {
        this.wss.sendEvent('updateMeta2', <UpdateMeta>{
            id: id,
            class: klass,
            memento: newLocation
        });
        this.log.debug(klass, id, 'has been moved to', newLocation);
    }

    /**
     * If any nodes with fixed positions had been dragged out of place
     * then put back where they belong
     * If there are some devices selected reset only these
     */
    resetNodeLocations(): number {
        let numbernodes = 0;
        if (this.selectedNodes.length > 0) {
            this.devices
                .filter((d) => this.selectedNodes.some((s) => s.id === d.device.id))
                .forEach((dev) => {
                    Node.resetNodeLocation(<Node>dev.device);
                    numbernodes++;
                });
            this.hosts
                .filter((h) => this.selectedNodes.some((s) => s.id === h.host.id))
                .forEach((h) => {
                    Host.resetNodeLocation(<Host>h.host);
                    numbernodes++;
                });
        } else {
            this.devices.forEach((dev) => {
                Node.resetNodeLocation(<Node>dev.device);
                numbernodes++;
            });
            this.hosts.forEach((h) => {
                Host.resetNodeLocation(<Host>h.host);
                numbernodes++;
            });
        }
        this.graph.reinitSimulation();
        return numbernodes;
    }

    /**
     * Toggle floating nodes between unpinned and frozen
     * There may be frozen and unpinned in the selection
     *
     * If there are nodes selected toggle only these
     */
    unpinOrFreezeNodes(freeze: boolean): number {
        let numbernodes = 0;
        if (this.selectedNodes.length > 0) {
            this.devices
                .filter((d) => this.selectedNodes.some((s) => s.id === d.device.id))
                .forEach((d) => {
                    Node.unpinOrFreezeNode(<Node>d.device, freeze);
                    numbernodes++;
                });
            this.hosts
                .filter((h) => this.selectedNodes.some((s) => s.id === h.host.id))
                .forEach((h) => {
                    Node.unpinOrFreezeNode(<Node>h.host, freeze);
                    numbernodes++;
                });
        } else {
            this.devices.forEach((d) => {
                Node.unpinOrFreezeNode(<Node>d.device, freeze);
                numbernodes++;
            });
            this.hosts.forEach((h) => {
                Node.unpinOrFreezeNode(<Node>h.host, freeze);
                numbernodes++;
            });
        }
        this.graph.reinitSimulation();
        return numbernodes;
    }

}

