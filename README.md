# ASUS TUF Gaming M3 — Controller

> A lightweight, open-source desktop utility for configuring the **ASUS TUF Gaming M3** mouse on **NixOS / Linux**.
>
> **NOTE**: This branch (`nix/linux`) contains Linux-specific optimizations and Nix environment configuration. For the stable Windows version, see the [`main`](https://github.com/MdTalhaZubayer/asus-tuf-gaming-m3-tauri/tree/main) branch.

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

### Runtime
- **NixOS / Linux** (x64/AArch64)  
- ASUS TUF Gaming M3 mouse connected via USB

### Build Dependencies

| Tool | Version | Install |
|---|---|---|
| [Rust](https://rustup.rs/) | stable | `rustup install stable` |
| [Bun](https://bun.sh/) | latest | `winget install Oven-sh.Bun` |
| [Tauri CLI](https://tauri.app/start/) | v2 | included in `devDependencies` |
| WebView2 | (usually pre-installed on Win 11) | [Download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

---

## NixOS / Linux

A [`flake.nix`](flake.nix) is included. It provides a dev shell, an installable package, and a NixOS module for the USB udev rule.

### Dev shell (development)

```bash
nix develop        # with flakes
# or
nix-shell          # shell.nix fallback
bun install
bun run tauri dev
```

### Install as a Nix package

> **One-time step** — the frontend build is a Fixed-Output Derivation that needs a real hash.

```bash
# 1. First build (will fail with hash mismatch, but prints the real hash)
nix build .#frontend 2>&1 | grep "got:"

# 2. Replace the fakeSha256 placeholder in flake.nix with the printed hash

# 3. Build the full app
nix build
./result/bin/asus-mouse-control-tauri
```

### NixOS udev rule (required for mouse access)

Add to your `configuration.nix`:

```nix
imports = [ inputs.asus-m3.nixosModules.default ];
```

Or manually:

```nix
services.udev.extraRules = ''
  SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b05", ATTRS{idProduct}=="1910", \
    MODE="0666", GROUP="input", TAG+="uaccess"
'';
```

Then `sudo nixos-rebuild switch`.

---


## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/asus-tuf-gaming-m3-tauri.git
cd asus-tuf-gaming-m3-tauri
```

### 2. Install frontend dependencies

```bash
bun install
```

### 3. Run in development mode

```bash
bun run tauri dev
```

> The Tauri window will open and hot-reload on frontend changes. The mouse must be connected for HID commands to work.

---

## Building

### Production build (Linux)

```bash
# Recommended: Build via Nix (produces a standalone closure)
nix build
./result/bin/asus-mouse-control-tauri

# Or using Bun/Tauri CLI in the dev shell
bun run tauri build
```

The installer and binary will be output to:

```
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
```

You'll find:
- `nsis/` — NSIS installer (`.exe`)
- `msi/` — MSI installer

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
│   ├── App.css             # Styles
│   └── assets/             # Logo assets
├── src-tauri/              # Rust/Tauri backend
│   ├── src/
│   │   ├── lib.rs          # HID commands, Tauri command handlers
│   │   └── main.rs         # Entry point
│   ├── icons/              # App & tray icons
│   ├── capabilities/       # Tauri permission definitions
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
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
