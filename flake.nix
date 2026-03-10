{
  description = "ASUS TUF Gaming M3 — lightweight mouse controller built with Tauri 2";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    crane.url = "github:ipetkov/crane";

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, crane, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default;
        craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

        # ── Runtime / link-time deps ─────────────────────────────────────────
        buildInputs = with pkgs; [
          webkitgtk_4_1   # Tauri webview on Linux
          libsoup_3
          gtk3
          glib
          cairo
          pango
          gdk-pixbuf
          atk
          librsvg
          openssl
          hidapi           # USB HID (replaces Windows hidapi)
          udev
        ];

        # ── Build-time deps ──────────────────────────────────────────────────
        nativeBuildInputs = with pkgs; [
          pkg-config
          bun
          nodejs
          wrapGAppsHook4
        ];

        # ── Pre-build the React frontend (bun → dist/) ───────────────────────
        # This is a Fixed-Output Derivation: Nix allows network inside FODs
        # because the hash pins the output. Run `nix build .#frontend` once,
        # replace `sha256-AAAA…` with the printed hash, then re-run.
        frontend = pkgs.stdenv.mkDerivation {
          name = "asus-m3-frontend";
          src = ./.;

          nativeBuildInputs = [ pkgs.bun pkgs.nodejs pkgs.cacert ];

          HOME = "$TMPDIR";
          BUN_INSTALL_CACHE_DIR = "$TMPDIR/.bun-cache";

          buildPhase = ''
            bun install --frozen-lockfile
            bun run build
          '';

          installPhase = ''
            cp -r dist $out
          '';

          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          # ⚠ Replace with the real hash after your first `nix build .#frontend`
          outputHash = pkgs.lib.fakeSha256;
        };

        # ── Cache Cargo dependencies in a separate derivation ────────────────
        cargoArtifacts = craneLib.buildDepsOnly {
          src = craneLib.cleanCargoSource ./.;
          inherit buildInputs nativeBuildInputs;
          cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
          doCheck = false;
        };

      in
      {
        # ── Installable package ──────────────────────────────────────────────
        packages = {
          frontend = frontend;

          default = craneLib.buildPackage {
            inherit cargoArtifacts buildInputs nativeBuildInputs;
            src = ./.;
            cargoExtraArgs = "--manifest-path src-tauri/Cargo.toml";
            doCheck = false;

            preBuild = ''
              echo "→ Injecting pre-built frontend into dist/"
              cp -r ${frontend} dist
            '';

            meta = with pkgs.lib; {
              description = "ASUS TUF Gaming M3 mouse controller (no Armoury Crate needed)";
              homepage    = "https://github.com/MdTalhaZubayer/asus-tuf-gaming-m3-tauri";
              license     = licenses.mit;
              maintainers = [ "MdTalhaZubayer" ];
              platforms   = [ "x86_64-linux" "aarch64-linux" ];
            };
          };
        };

        # ── Development shell ────────────────────────────────────────────────
        devShells.default = pkgs.mkShell {
          inherit buildInputs;
          nativeBuildInputs = nativeBuildInputs ++ [ rustToolchain ];

          # Lets WebKitGTK find fonts / certs at runtime in the dev shell
          WEBKIT_DISABLE_COMPOSITING_MODE = "1";
          PKG_CONFIG_PATH = "${pkgs.hidapi}/lib/pkgconfig:${pkgs.openssl.dev}/lib/pkgconfig";

          shellHook = ''
            echo "🖱️  ASUS TUF Gaming M3 dev shell ready"
            echo "  bun install          – install JS deps"
            echo "  bun run tauri dev    – start Tauri + Vite dev"
            echo "  bun run tauri build  – production build"
          '';
        };
      }
    )

    //

    # ── NixOS module (system-wide udev rule) — add to your configuration.nix ─
    {
      nixosModules.default = { ... }: {
        services.udev.extraRules = ''
          # ASUS TUF Gaming M3 (VID 0x0B05 / PID 0x1910) — allow hidraw access
          SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b05", ATTRS{idProduct}=="1910", \
            MODE="0666", GROUP="input", TAG+="uaccess"
        '';
      };
    };
}
