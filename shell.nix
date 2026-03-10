# Fallback for NixOS users who don't use flakes.
# Usage: nix-shell
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Rust
    rustup

    # Tauri / WebKitGTK
    pkg-config
    webkitgtk_4_1
    libsoup_3
    gtk3
    glib
    cairo
    pango
    gdk-pixbuf
    atk
    librsvg
    openssl

    # USB HID
    hidapi
    udev

    # Frontend
    bun
    nodejs

    # Tauri helpers
    wrapGAppsHook4
  ];

  shellHook = ''
    export PKG_CONFIG_PATH="${pkgs.hidapi}/lib/pkgconfig:${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"
    export WEBKIT_DISABLE_COMPOSITING_MODE=1
    rustup install stable 2>/dev/null || true
    echo "🖱️  Run: bun install && bun run tauri dev"
  '';
}
