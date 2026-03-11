use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
// use tauri_plugin_positioner::{Position, WindowExt}; 

const VID: u16 = 0x0B05;
const PID: u16 = 0x1910;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LedSettings {
    mode: String,
    brightness: u8,
    r: u8,
    g: u8,
    b: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ButtonBinding {
    physical: String,
    action: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MouseSettings {
    #[serde(rename = "activeProfile")]
    active_profile: u8,
    dpis: Vec<u32>,
    #[serde(rename = "pollingRate")]
    polling_rate: u16,
    debounce: u8,
    #[serde(rename = "angleSnapping")]
    angle_snapping: bool,
    led: LedSettings,
    buttons: Vec<ButtonBinding>,
}

// ── ASUS HID command codes ────────────────────────────────────────────────────
const ASUS_CMD_GET_PROFILE: u16  = 0x0012; 
const ASUS_CMD_GET_SETTINGS: u16 = 0x0412; 
const ASUS_CMD_GET_BUTTONS: u16  = 0x0512; 
const ASUS_CMD_GET_LED: u16      = 0x0312; 
const ASUS_CMD_SET_SETTING: u16  = 0x3151; 
const ASUS_CMD_SET_BUTTON: u16   = 0x2151; 
const ASUS_CMD_SET_LED: u16      = 0x2851; 
const ASUS_CMD_SAVE: u16         = 0x0350; 

const POLLING_RATES: [u16; 4] = [125, 250, 500, 1000];
const DEBOUNCE_TIMES: [u8; 8] = [4, 8, 12, 16, 20, 24, 28, 32];

fn get_device(api: &HidApi) -> Result<HidDevice, String> {
    for device in api.device_list() {
        if device.vendor_id() == VID && device.product_id() == PID && device.interface_number() == 1 {
            return api.open_path(device.path()).map_err(|e| e.to_string());
        }
    }
    Err("ASUS TUF M3 (Interface 1) not found".into())
}

fn build_packet(cmd: u16) -> [u8; 65] {
    let mut buf = [0u8; 65];
    let bytes = cmd.to_le_bytes();
    buf[1] = bytes[0];
    buf[2] = bytes[1];
    buf
}

fn send_packet(dev: &HidDevice, pkt: &[u8; 65]) -> Result<(), String> {
    dev.write(pkt).map_err(|e| format!("Write failed: {}", e))?;
    thread::sleep(Duration::from_millis(50));
    Ok(())
}

fn read_exact_response(dev: &HidDevice, byte0: u8, byte1: u8) -> Result<Vec<u8>, String> {
    let mut buf = [0u8; 64];
    for _ in 0..20 {
        let n = dev.read_timeout(&mut buf, 100).map_err(|e| e.to_string())?;
        if n >= 2 && buf[0] == byte0 && buf[1] == byte1 {
            return Ok(buf.to_vec());
        }
        thread::sleep(Duration::from_millis(10));
    }
    Err(format!("Timeout waiting for response {:02X} {:02X}", byte0, byte1))
}

fn save_to_eeprom(dev: &HidDevice) -> Result<(), String> {
    let pkt = build_packet(ASUS_CMD_SAVE);
    send_packet(dev, &pkt)?;
    thread::sleep(Duration::from_millis(500));
    Ok(())
}

fn get_action_name(code: u8) -> String {
    match code {
        0xf0 => "left".into(),
        0xf1 => "right".into(),
        0xf2 => "middle".into(),
        0xe4 => "back".into(),
        0xe5 => "forward".into(),
        0xe6 => "dpi-up".into(),
        0xe7 => "dpi-down".into(),
        0xe8 => "scroll-up".into(),
        0xe9 => "scroll-down".into(),
        0xff => "disabled".into(),
        _    => format!("0x{:02X}", code),
    }
}

fn get_action_code(name: &str) -> Option<u8> {
    match name {
        "left"        => Some(0xf0),
        "right"       => Some(0xf1),
        "middle"      => Some(0xf2),
        "back"        => Some(0xe4),
        "forward"     => Some(0xe5),
        "dpi-up"      => Some(0xe6),
        "dpi-down"    => Some(0xe7),
        "scroll-up"   => Some(0xe8),
        "scroll-down" => Some(0xe9),
        "disabled"    => Some(0xff),
        _             => None,
    }
}

const PHYSICAL_BUTTONS: [(&str, u8); 9] = [
    ("left",        0xf0),
    ("right",       0xf1),
    ("middle",      0xf2),
    ("back",        0xe4),
    ("forward",     0xe5),
    ("dpi-up",      0xe6),
    ("dpi-down",    0xe7),
    ("scroll-up",   0xe8),
    ("scroll-down", 0xe9),
];

#[tauri::command]
fn get_settings() -> Result<MouseSettings, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let dev = get_device(&api)?;

    // 1. Profile
    let pkt = build_packet(ASUS_CMD_GET_PROFILE);
    send_packet(&dev, &pkt)?;
    let res_prof = read_exact_response(&dev, 0x12, 0x00)?;
    let mut active_profile = 0;
    if res_prof[11] >= 1 && res_prof[11] <= 4 {
        active_profile = res_prof[11] - 1;
    }

    // 2. Settings (DPI, Polling, etc)
    let pkt = build_packet(ASUS_CMD_GET_SETTINGS);
    send_packet(&dev, &pkt)?;
    let res_settings = read_exact_response(&dev, 0x12, 0x04)?;
    
    let mut dpis = Vec::new();
    for i in 0..4 {
        let raw = res_settings[4 + i * 2];
        dpis.push((raw as u32) * 100 + 100);
    }
    
    let rate_id = res_settings[12] as usize;
    let polling_rate = if rate_id < POLLING_RATES.len() { POLLING_RATES[rate_id] } else { 1000 };
    
    let deb_id = res_settings[14] as usize;
    let debounce = if deb_id < DEBOUNCE_TIMES.len() { DEBOUNCE_TIMES[deb_id] } else { 4 };
    
    let angle_snapping = res_settings[16] != 0;

    // 3. LED
    let pkt = build_packet(ASUS_CMD_GET_LED);
    send_packet(&dev, &pkt)?;
    let res_led = read_exact_response(&dev, 0x12, 0x03)?;
    
    let mode_id = res_led[4];
    let brightness = res_led[5];
    let r = res_led[6];
    let g = res_led[7];
    let b = res_led[8];
    
    let mut mode = match mode_id {
        0 => "static",
        1 => "breathing",
        2 => "cycle",
        _ => "unknown",
    }.to_string();

    if brightness == 0 {
        mode = "off".to_string();
    }

    // 4. Buttons
    let pkt = build_packet(ASUS_CMD_GET_BUTTONS);
    send_packet(&dev, &pkt)?;
    let res_btns = read_exact_response(&dev, 0x12, 0x05)?;
    
    let mut buttons = Vec::new();
    for (i, (name, _)) in PHYSICAL_BUTTONS.iter().enumerate() {
        let offset = 4 + i * 2;
        buttons.push(ButtonBinding {
            physical: name.to_string(),
            action: get_action_name(res_btns[offset]),
        });
    }

    Ok(MouseSettings {
        active_profile,
        dpis,
        polling_rate,
        debounce,
        angle_snapping,
        led: LedSettings { mode, brightness, r, g, b },
        buttons,
    })
}

#[tauri::command]
fn save_to_mouse(settings: MouseSettings) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let dev = get_device(&api)?;

    // In ASUS TUF M3, we write settings field by field or command by command.
    
    // 1. DPI Stages
    for (i, &dpi) in settings.dpis.iter().enumerate() {
        if i > 3 { break; }
        let raw = ((dpi as i32 - 100) / 100).max(0).min(50) as u8;
        let mut pkt = build_packet(ASUS_CMD_SET_SETTING);
        pkt[3] = i as u8;
        pkt[5] = raw;
        send_packet(&dev, &pkt)?;
    }

    // 2. Polling Rate
    if let Some(idx) = POLLING_RATES.iter().position(|&r| r == settings.polling_rate) {
        let mut pkt = build_packet(ASUS_CMD_SET_SETTING);
        pkt[3] = 4; // FIELD_RATE
        pkt[5] = idx as u8;
        send_packet(&dev, &pkt)?;
    }

    // 3. Debounce
    if let Some(idx) = DEBOUNCE_TIMES.iter().position(|&t| t == settings.debounce) {
        let mut pkt = build_packet(ASUS_CMD_SET_SETTING);
        pkt[3] = 5; // FIELD_RESPONSE
        pkt[5] = idx as u8;
        send_packet(&dev, &pkt)?;
    }

    // 4. Angle Snapping
    let mut pkt = build_packet(ASUS_CMD_SET_SETTING);
    pkt[3] = 6; // FIELD_SNAPPING
    pkt[5] = if settings.angle_snapping { 1 } else { 0 };
    send_packet(&dev, &pkt)?;

    // 5. LED
    let mode_id = match settings.led.mode.as_str() {
        "static" | "off" => 0,
        "breathing" => 1,
        "cycle" => 2,
        _ => 0,
    };
    let brightness = if settings.led.mode == "off" { 0 } else { settings.led.brightness };

    let mut pkt = build_packet(ASUS_CMD_SET_LED);
    pkt[3] = 0; // Zone
    pkt[5] = mode_id;
    pkt[6] = brightness;
    pkt[7] = settings.led.r;
    pkt[8] = settings.led.g;
    pkt[9] = settings.led.b;
    send_packet(&dev, &pkt)?;

    // 6. Buttons remapping
    for binding in settings.buttons {
        if let Some(src_code) = PHYSICAL_BUTTONS.iter().find(|x| x.0 == binding.physical).map(|x| x.1) {
            if let Some(dst_code) = get_action_code(&binding.action) {
                let mut pkt = build_packet(ASUS_CMD_SET_BUTTON);
                pkt[5] = src_code;
                pkt[6] = 1; // BTN_TYPE_BUTTON
                pkt[7] = dst_code;
                pkt[8] = 1;
                send_packet(&dev, &pkt)?;
            }
        }
    }

    // 7. Save to EEPROM
    save_to_eeprom(&dev)?;

    Ok(true)
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![get_settings, save_to_mouse, hide_window])
        .setup(|app| {
            // Create a simple native menu
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let tray_icon_bytes = include_bytes!("../icons/32x32.png");
            let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes).expect("failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app_handle = tray.app_handle();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                // --- Manual "Safe-Edge" & Centered Positioning ---
                                if let Ok(Some(monitor)) = window.current_monitor() {
                                    let work_area = monitor.work_area();
                                    let screen_size = monitor.size();
                                    
                                    let win_w = 360;
                                    let win_h = 600;
                                    let margin = 12;

                                    let icon_x = position.x as i32;
                                    let icon_y = position.y as i32;

                                    let is_left = work_area.position.x > 0;
                                    let is_top = work_area.position.y > 0;
                                    let is_right = work_area.size.width < screen_size.width && work_area.position.x == 0;

                                    let mut x;
                                    let mut y;

                                    if is_left {
                                        x = work_area.position.x + margin;
                                        y = icon_y - (win_h / 2);
                                    } else if is_right {
                                        x = (work_area.size.width as i32) - win_w - margin;
                                        y = icon_y - (win_h / 2);
                                    } else if is_top {
                                        x = icon_x - (win_w / 2);
                                        y = work_area.position.y + margin;
                                    } else { // Bottom
                                        x = icon_x - (win_w / 2);
                                        y = work_area.position.y + (work_area.size.height as i32) - win_h - margin;
                                    }

                                    // Clamp to work area to prevent off-screen bleeding
                                    x = x.max(work_area.position.x + margin)
                                         .min(work_area.position.x + (work_area.size.width as i32) - win_w - margin);
                                    y = y.max(work_area.position.y + margin)
                                         .min(work_area.position.y + (work_area.size.height as i32) - win_h - margin);

                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                                }
                                
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                tauri::WindowEvent::Focused(false) => {
                    // Standard tray utility behavior: hide when focus is lost
                    // On some Linux compositors (like Hyprland), focus-follows-mouse
                    // can cause the window to hide immediately. We disable this for Linux
                    // to maintain a stable window until the user closes it.
                    #[cfg(not(target_os = "linux"))]
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
