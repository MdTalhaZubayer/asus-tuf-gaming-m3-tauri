# ASUS TUF Gaming M3 — Controller

> A lightweight, open-source desktop utility for configuring the **ASUS TUF Gaming M3** mouse on **NixOS / Linux**.

Built with [Tauri 2](https://tauri.app/), [React 19](https://react.dev/), and [Rust](https://www.rust-lang.org/). Communicates directly with the mouse over **USB HID**.

---

## Features

| Feature | Details |
|---|---|
| 🎯 **DPI Stages** | Configure all 4 DPI stages (100 – 5100 DPI) individually |
| ⚡ **Polling Rate** | Switch between 125 / 250 / 500 / 1000 Hz |
| 🖱️ **Debounce** | Adjust click debounce time (4 – 32 ms) |
| 📐 **Angle Snapping** | Toggle angle snapping on/off |
| 💡 **Aura RGB** | Control LED mode (Static, Breathing, Cycle, Off), color & intensity |
| 🔘 **Button Remapping** | Remap all 7 programmable buttons |
| 💾 **EEPROM Persistence** | Settings are saved directly to the mouse's onboard memory |
| 🔲 **System Tray** | Runs as a tray app — click the icon to toggle the compact UI |

---

## Screenshots

> The app sits in your system tray and pops up as a compact 360×600 panel.

<table>
  <tr>
    <td align="center"><b>Performance</b></td>
    <td align="center"><b>Light</b></td>
    <td align="center"><b>Buttons</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/performance.png" width="220" alt="Performance tab — DPI stages, polling rate, debounce &amp; angle snapping"/></td>
    <td><img src="screenshots/light.png" width="220" alt="Light tab — Aura RGB mode, color &amp; intensity"/></td>
    <td><img src="screenshots/buttons.png" width="220" alt="Buttons tab — remap all 7 programmable buttons"/></td>
  </tr>
</table>

---

## Requirements

- **NixOS / Linux** (x64/AArch64)
- ASUS TUF Gaming M3 mouse connected via USB

---

## Install as a NixOS Service (recommended)

Add this flake to your NixOS configuration for a fully managed setup — the app is installed, the udev rule is created, and a systemd user service auto-starts the tray app on login.

### 1. Add the flake input

```nix
# flake.nix
{
  inputs.asus-m3.url = "github:MdTalhaZubayer/asus-tuf-gaming-m3-tauri/nix/linux";
  # ...
}
```

### 2. Enable the service

```nix
# configuration.nix
{ inputs, ... }:
{
  imports = [ inputs.asus-m3.nixosModules.default ];
  services.asus-tuf-gaming-m3.enable = true;
}
```

Then `sudo nixos-rebuild switch`.

This will:
- Install the binary system-wide
- Create the udev rule for USB HID access (no `sudo` needed to talk to the mouse)
- Start a systemd user service on graphical login (`asus-tuf-gaming-m3.service`)

### Manual udev rule (without the module)

If you only want the udev rule without the service:

```nix
services.udev.extraRules = ''
  SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b05", ATTRS{idProduct}=="1910", \
    MODE="0666", GROUP="input", TAG+="uaccess"
'';
```

---

## Development

### Dev shell (with flakes)

```bash
nix develop
bun install
bun run tauri dev
```

> The Tauri window will open and hot-reload on frontend changes. The mouse must be connected for HID commands to work.

---

## Building

### Production build (via Nix)

```bash
nix build
./result/bin/asus-mouse-control-tauri
```

> **First build note**: The frontend build is a Fixed-Output Derivation. If the hash is stale, the build will fail and print the correct hash. Update `flake.nix` with the printed hash and re-run `nix build`.

### Frontend-only build (for debugging)

```bash
bun run build
```

Output goes to `dist/`.

---

## How It Works

The app talks to the mouse using raw **USB HID reports** via the [`hidapi`](https://crates.io/crates/hidapi) Rust crate.

- **Vendor ID**: `0x0B05` (ASUS)
- **Product ID**: `0x1910` (TUF Gaming M3)
- **Interface**: `1` (configuration interface)

Settings are read from and written to the mouse's **onboard EEPROM**, so they persist without any software running — changes survive reboots and work on any PC.

```
Frontend (React/TypeScript)
        │  invoke()
        ▼
Tauri IPC Bridge
        │
        ▼
Rust Backend (lib.rs)
        │  hidapi
        ▼
USB HID Interface 1
        │
        ▼
ASUS TUF Gaming M3 (onboard EEPROM)
```

---

## Project Structure

```
asus-tuf-gaming-m3-tauri/
├── src/                    # React frontend
│   ├── App.tsx             # Main UI (tabs: Perf, Light, Btns)
│   ├── App.css             # Styles (with local font-face)
│   ├── fonts/              # Bundled fonts (JetBrains Mono, Inter)
│   └── assets/             # Logo assets
├── src-tauri/              # Rust/Tauri backend
│   ├── src/
│   │   ├── lib.rs          # HID commands, Tauri command handlers
│   │   └── main.rs         # Entry point
│   ├── icons/              # App & tray icons
│   ├── capabilities/       # Tauri permission definitions
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── flake.nix               # Nix flake (package + NixOS module)
├── index.html
├── vite.config.ts
└── package.json
```

---

## Acknowledgements

This project was developed with AI assistance ([Google Antigravity](https://antigravity.google)) for code generation, USB HID protocol reverse engineering, and documentation.

---

## License

MIT © [Md Talha Zubayer](https://github.com/MdTalhaZubayer)
