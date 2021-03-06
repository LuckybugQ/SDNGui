/*
 * Copyright 2018-present Open Networking Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { Injectable } from '@angular/core';
import { LogService } from '../log.service';
import { WebSocketService } from '../remote/websocket.service';
import { THIS_EXPR } from '@angular/compiler/src/output/output_ast';
import { FnService } from './fn.service';

/**
 * A definition of Lion data
 */
export interface Lion {
    locale: any;
    lion: any;
}


/**
 * ONOS GUI -- Lion -- Localization Utilities
 */
@Injectable({
  providedIn: 'root',
})
export class LionService {

    ubercache: any[] = [];
    loadCbs = new Map<string, () => void>([]); // A map of functions


    lion = {
        "core.fw.Mast": {
          "confirm_refresh_title": "Confirm GUI Refresh",
          "logout": "Logout",
          "tt_help": "Show help page for current view",
          "ui_ok_to_update": "Press OK to update the GUI.",
          "uicomp_added": "New GUI components were added.",
          "uicomp_removed": "Some GUI components were removed.",
          "unknown_user": "(no one)"
        },
        "core.fw.Nav": {
          "cat_network": "Network",
          "cat_other": "Other",
          "cat_platform": "Platform",
          "nav_item_app": "Applications",
          "nav_item_cluster": "Cluster Nodes",
          "nav_item_device": "Devices",
          "nav_item_host": "Hosts",
          "nav_item_intent": "Intents",
          "nav_item_link": "Links",
          "nav_item_partition": "Partitions",
          "nav_item_processor": "Packet Processors",
          "nav_item_settings": "Settings",
          "nav_item_topo": "Topology",
          "nav_item_topo2": "Topology 2",
          "nav_item_tunnel": "Tunnels"
        },
        "core.fw.QuickHelp": {
          "qh_hint_close_detail": "Close the details panel",
          "qh_hint_esc": "Dismiss dialog or cancel selections",
          "qh_hint_show_hide_qh": "Show / hide Quick Help",
          "qh_hint_t": "Toggle theme",
          "qh_title": "Quick Help"
        },
        "core.view.App": {
          "activate": "Activate",
          "app_id": "App ID",
          "category": "Category",
          "click_row": "click row",
          "deactivate": "Deactivate",
          "dlg_confirm_action": "Confirm Action",
          "dlg_warn_deactivate": "Deactivating or uninstalling this component can have serious negative consequences!",
          "dlg_warn_own_risk": "** DO SO AT YOUR OWN RISK **",
          "dp_features": "Features",
          "dp_permissions": "Permissions",
          "dp_required_apps": "Required Apps",
          "icon": "Icon",
          "nav_item_app": "Applications",
          "origin": "Origin",
          "qh_hint_click_row": "Select / deselect application",
          "qh_hint_close_detail": "Close the details panel",
          "qh_hint_esc": "Deselect application",
          "qh_hint_scroll_down": "See more applications",
          "role": "Role",
          "scroll_down": "scroll down",
          "state": "State",
          "title": "Title",
          "title_apps": "Applications",
          "total": "Total",
          "tt_ctl_activate": "Activate selected application",
          "tt_ctl_auto_refresh": "Toggle auto refresh",
          "tt_ctl_deactivate": "Deactivate selected application",
          "tt_ctl_download": "Download selected application (.oar file)",
          "tt_ctl_uninstall": "Uninstall selected application",
          "tt_ctl_upload": "Upload an application (.oar file)",
          "uninstall": "Uninstall",
          "version": "Version"
        },
        "core.view.Cluster": {
          "active": "Active",
          "chassis_id": "Chassis ID",
          "click": "click",
          "devices": "Devices",
          "hw_version": "H/W Version",
          "ip_address": "IP Address",
          "last_updated": "Last Updated",
          "nav_item_cluster": "Cluster Nodes",
          "node_id": "Node ID",
          "protocol": "Protocol",
          "qh_hint_click": "Select a row to show cluster node details",
          "qh_hint_close_detail": "Close the details panel",
          "qh_hint_scroll_down": "See available cluster nodes",
          "scroll_down": "scroll down",
          "serial_number": "Serial #",
          "started": "Started",
          "sw_version": "S/W Version",
          "tcp_port": "TCP Port",
          "title_cluster_nodes": "Cluster Nodes",
          "total": "Total",
          "type": "Type",
          "uri": "URI",
          "vendor": "Vendor"
        },
        "core.view.Topo": {
          "active": "active",
          "added": "added",
          "btn_show_view_device": "Show Device View",
          "btn_show_view_flow": "Show Flow View for this Device",
          "btn_show_view_group": "Show Group View for this Device",
          "btn_show_view_meter": "Show Meter View for this Device",
          "btn_show_view_port": "Show Port View for this Device",
          "click": "click",
          "close": "Close",
          "cmd_drag": "cmd-drag",
          "cmd_scroll": "cmd-scroll",
          "device": "Device",
          "devices": "Devices",
          "direct": "direct",
          "disable": "Disable",
          "drag": "drag",
          "edge": "edge",
          "enable": "Enable",
          "expected": "expected",
          "fl_background_map": "background map",
          "fl_bad_links": "Bad Links",
          "fl_device_labels_hide": "Hide device labels",
          "fl_device_labels_show_friendly": "Show friendly device labels",
          "fl_device_labels_show_id": "Show device ID labels",
          "fl_eq_masters": "Equalizing master roles",
          "fl_grid_display_1000": "Show XY grid",
          "fl_grid_display_both": "Show both grids",
          "fl_grid_display_geo": "Show Geo grid",
          "fl_grid_display_hide": "Hide grid",
          "fl_host_labels_hide": "Hide host labels",
          "fl_host_labels_show_friendly": "Show friendly host labels",
          "fl_host_labels_show_ip": "Show host IP addresses",
          "fl_host_labels_show_mac": "Show host MAC addresses",
          "fl_layer_all": "All Layers Shown",
          "fl_layer_opt": "Optical Layer Shown",
          "fl_layer_pkt": "Packet Layer Shown",
          "fl_monitoring_canceled": "Monitoring Canceled",
          "fl_normal_view": "Normal View",
          "fl_oblique_view": "Oblique View",
          "fl_offline_devices": "Offline Devices",
          "fl_pan_zoom_reset": "Pan and zoom reset",
          "fl_panel_details": "Details Panel",
          "fl_panel_instances": "Instances Panel",
          "fl_panel_summary": "Summary Panel",
          "fl_pinned_floating_nodes": "Pinned floating nodes",
          "fl_port_highlighting": "Port Highlighting",
          "fl_reset_node_locations": "Reset Node Locations",
          "fl_selecting_intent": "Selecting Intent",
          "fl_sprite_layer": "sprite layer",
          "fl_unpinned_floating_nodes": "Unpinned floating nodes",
          "flows": "Flows",
          "grid_x": "Grid X",
          "grid_y": "Grid Y",
          "hidden": "Hidden",
          "hide": "Hide",
          "host": "Host",
          "hosts": "Hosts",
          "hw_version": "H/W Version",
          "inactive": "inactive",
          "indirect": "indirect",
          "intent": "Intent",
          "intents": "Intents",
          "ip": "IP",
          "latitude": "Latitude",
          "links": "Links",
          "longitude": "Longitude",
          "lp_label_a2b": "A to B",
          "lp_label_a_friendly": "A name",
          "lp_label_a_id": "A id",
          "lp_label_a_port": "A port",
          "lp_label_a_type": "A type",
          "lp_label_b2a": "B to A",
          "lp_label_b_friendly": "B name",
          "lp_label_b_id": "B id",
          "lp_label_b_port": "B port",
          "lp_label_b_type": "B type",
          "lp_label_friendly": "Friendly",
          "lp_value_no_link": "[no link]",
          "mac": "MAC",
          "nav_item_topo": "Topology",
          "no_devices_are_connected": "No Devices Are Connected",
          "not_expected": "not expected",
          "ok": "OK",
          "optical": "optical",
          "ov_tt_none": "No Overlay",
          "ov_tt_protected_intents": "Protected Intents Overlay",
          "ov_tt_traffic": "Traffic Overlay",
          "ports": "Ports",
          "protocol": "Protocol",
          "purged": "purged",
          "qh_gest_click": "Select the item and show details",
          "qh_gest_cmd_drag": "Pan",
          "qh_gest_cmd_scroll": "Zoom in / out",
          "qh_gest_drag": "Reposition (and pin) device / host",
          "qh_gest_shift_click": "Toggle selection state",
          "qh_hint_close_detail": "Close the details panel",
          "resubmitted": "resubmitted",
          "select": "Select",
          "serial_number": "Serial #",
          "shift_click": "shift-click",
          "show": "Show",
          "sw_version": "S/W Version",
          "tbtt_bad_links": "Show bad links",
          "tbtt_cyc_dev_labs": "Cycle device labels",
          "tbtt_cyc_grid_display": "Cycle grid display",
          "tbtt_cyc_host_labs": "Cycle host labels",
          "tbtt_cyc_layers": "Cycle node layers",
          "tbtt_eq_master": "Equalize mastership roles",
          "tbtt_reset_loc": "Reset node locations",
          "tbtt_reset_zoom": "Reset pan / zoom",
          "tbtt_sel_map": "Select background geo map",
          "tbtt_tog_host": "Toggle host visibility",
          "tbtt_tog_instances": "Toggle ONOS instances panel",
          "tbtt_tog_map": "Toggle background geo map",
          "tbtt_tog_oblique": "Toggle oblique view (experimental)",
          "tbtt_tog_offline": "Toggle offline visibility",
          "tbtt_tog_porthi": "Toggle port highlighting",
          "tbtt_tog_sprite": "Toggle sprite layer",
          "tbtt_tog_summary": "Toggle ONOS summary panel",
          "tbtt_tog_toolbar": "Toggle Toolbar",
          "tbtt_tog_use_detail": "Disable / enable details panel",
          "tbtt_unpin_node": "Unpin node (hover mouse over)",
          "title_edge_link": "Edge Link",
          "title_infra_link": "Infrastructure Link",
          "title_panel_summary": "ONOS Summary",
          "title_select_map": "Select Map",
          "title_selected_items": "Selected Items",
          "topology_sccs": "Topology SCCs",
          "tr_btn_cancel_monitoring": "Cancel traffic monitoring",
          "tr_btn_create_h2h_flow": "Create Host-to-Host Flow",
          "tr_btn_create_msrc_flow": "Create Multi-Source Flow",
          "tr_btn_monitor_all": "Monitor all traffic",
          "tr_btn_monitor_sel_intent": "Monitor traffic of selected intent",
          "tr_btn_show_all_rel_intents": "Show all related intents",
          "tr_btn_show_dev_link_flows": "Show device link flows",
          "tr_btn_show_device_flows": "Show Device Flows",
          "tr_btn_show_next_rel_intent": "Show next related intent",
          "tr_btn_show_prev_rel_intent": "Show previous related intent",
          "tr_btn_show_related_traffic": "Show Related Traffic",
          "tr_fl_dev_flows": "Device Flows",
          "tr_fl_fstats_bytes": "Flow Stats (bytes)",
          "tr_fl_h2h_flow_added": "Host-to-Host flow added",
          "tr_fl_multisrc_flow": "Multi-Source Flow",
          "tr_fl_next_rel_int": "Next related intent",
          "tr_fl_prev_rel_int": "Previous related intent",
          "tr_fl_pstats_bits": "Port Stats (bits / second)",
          "tr_fl_pstats_pkts": "Port Stats (packets / second)",
          "tr_fl_rel_paths": "Related Paths",
          "tr_fl_traf_on_path": "Traffic on Selected Path",
          "tunnel": "tunnel",
          "tunnels": "Tunnels",
          "uri": "URI",
          "vendor": "Vendor",
          "version": "Version",
          "virtual": "virtual",
          "visible": "Visible",
          "vlan": "VLAN",
          "vlan_none": "None",
          "withdrawn": "withdrawn"
        },
        "core.view.Flow": {
          "appId": "App ID",
          "appName": "App Name",
          "bytes": "Bytes",
          "duration": "Duration ",
          "flowId": "Flow ID",
          "groupId": "Group ID",
          "hardTimeout": "Hard Timeout",
          "idleTimeout": "Idle Timeout",
          "nav_item_flow": "Flows",
          "packets": "Packets",
          "permanent": "Permanent",
          "priority": "Flow Priority ",
          "selector": "Selector",
          "state": "State",
          "tableName": "Table Name ",
          "title_flows": "Flows for Device ",
          "total": "Total",
          "treatment": "Treatment",
          "tt_ctl_show_device": "Show device table",
          "tt_ctl_show_group": "Show group view for this device",
          "tt_ctl_show_meter": "Show meter view for selected device",
          "tt_ctl_show_pipeconf": "Show pipeconf view for selected device",
          "tt_ctl_show_port": "Show port view for this device",
          "tt_ctl_switcth_brief": "Switch to brief view",
          "tt_ctl_switcth_detailed": "Switch to detailed view"
        }
      }

    /**
     * Handler for uberlion event from WSS
     */
    uberlion(data: any) {
        this.ubercache = data;

        // this.log.info('LION service: Locale... [' + data.locale + ']');
        this.log.info('LION service: Bundles installed...');

        for (const p in this.ubercache) {
            if (this.ubercache[p]) {
                this.log.info('            :=> ', p);
            }
        }
        // If any component had registered a callback, call it now
        // that LION is loaded
        for (const cbname of this.loadCbs.keys()) {
            this.log.debug('Updating', cbname, 'with LION');
            this.loadCbs.get(cbname)();
        }

        this.log.debug('LION service: uber-lion bundle received');
    }

    constructor(
        private log: LogService,
        private wss: WebSocketService
    ) {
        // this.wss.bindHandlers(new Map<string, (data) => void>([
        //     ['uberlion', (data) => this.uberlion(data) ]
        // ]));
        this.log.debug('LionService constructed');
        this.uberlion(this.lion);
        //this.ubercache.push('ZZQ LION');
        
    }
    /**
     * Returns a lion bundle (function) for the given bundle ID (string)
     * returns a function that takes a string and returns a string
     */
    
    bundle(bundleId: string): (string) => string {
        let bundleObj = this.ubercache[bundleId];

        if (!bundleObj) {
            this.log.warn('No lion bundle registered:', bundleId);
            bundleObj = {};
        }

        return (key) =>  {
            return bundleObj[key] || key;
        };
    }
}
