{
  description = "ASUS TUF Gaming M3 — lightweight mouse controller built with Tauri 2";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

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
          hidapi           # USB HID
          udev
          libayatana-appindicator
          gsettings-desktop-schemas
          fontconfig
          glib-networking
          jetbrains-mono   # app fonts
          inter
        ];

        # ── Build-time deps ──────────────────────────────────────────────────
        nativeBuildInputs = with pkgs; [
          pkg-config
          cargo-tauri.hook
          bun
          nodejs
          wrapGAppsHook4
        ];

        # ── Pre-build the React frontend (bun → dist/) ───────────────────────
        # Fixed-Output Derivation: Nix allows network inside FODs because
        # the hash pins the output. If the hash is wrong, the build fails
        # and prints the correct hash — update it here and re-run.
        frontend = pkgs.stdenv.mkDerivation {
          name = "asus-m3-frontend";
          src = ./.;

          nativeBuildInputs = [ pkgs.bun pkgs.nodejs pkgs.cacert ];

          HOME = "$TMPDIR";
          BUN_INSTALL_CACHE_DIR = "$TMPDIR/.bun-cache";

          buildPhase = ''
            bun install --frozen-lockfile
            patchShebangs node_modules
            bun run build
          '';

          installPhase = ''
            cp -r dist $out
          '';

          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          # ⚠ Replace with the real hash after your first `nix build .#frontend`
          outputHash = "sha256-fjWAds40c/jkFHJ8uK1t0l6iqWl+dCPPUO4jn4ckYYI=";
        };

        # ── Fontconfig so WebKitGTK finds JetBrains Mono + Inter ─────────────
        fontsConf = pkgs.makeFontsConf {
          fontDirectories = [ pkgs.jetbrains-mono pkgs.inter ];
        };

        # ── The Tauri application ────────────────────────────────────────────
        asus-mouse-control-tauri = pkgs.rustPlatform.buildRustPackage {
          pname = "asus-mouse-control-tauri";
          version = "0.1.0";
          src = ./.;

          cargoRoot = "src-tauri";
          buildAndTestSubdir = "src-tauri";
          cargoLock.lockFile = ./src-tauri/Cargo.lock;

          inherit buildInputs nativeBuildInputs;

          TAURI_CONFIG_BUILD_BEFORE_BUILD_COMMAND = "";

          doCheck = false;

          preBuild = ''
            echo "→ Injecting pre-built frontend into dist/"
            cp -r ${frontend} dist
          '';

          # Ensure the wrapped binary can find our bundled fonts
          postFixup = ''
            wrapProgram $out/bin/asus-mouse-control-tauri \
              --set FONTCONFIG_FILE "${fontsConf}"
          '';

          meta = with pkgs.lib; {
            description = "ASUS TUF Gaming M3 mouse controller (no Armoury Crate needed)";
            homepage    = "https://github.com/MdTalhaZubayer/asus-tuf-gaming-m3-tauri";
            license     = licenses.mit;
            mainProgram = "asus-mouse-control-tauri";
            platforms   = [ "x86_64-linux" "aarch64-linux" ];
          };
        };

      in
      {
        # ── Installable packages ─────────────────────────────────────────────
        packages = {
          inherit frontend;
          default = asus-mouse-control-tauri;
        };

        # ── Development shell ────────────────────────────────────────────────
        devShells.default = pkgs.mkShell {
          inherit buildInputs;
          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook4
            cargo
            rustc
            cargo-tauri
            bun
            nodejs
          ];

          PKG_CONFIG_PATH = "${pkgs.hidapi}/lib/pkgconfig:${pkgs.openssl.dev}/lib/pkgconfig";
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath buildInputs;
          XDG_DATA_DIRS = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS";

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

    # ── NixOS module ─────────────────────────────────────────────────────────
    {
      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.asus-tuf-gaming-m3;
        in
        {
          options.services.asus-tuf-gaming-m3 = {
            enable = lib.mkEnableOption "ASUS TUF Gaming M3 mouse controller";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
              defaultText = lib.literalExpression "inputs.asus-m3.packages.\${pkgs.stdenv.hostPlatform.system}.default";
              description = "The asus-mouse-control-tauri package to use.";
            };
          };

          config = lib.mkIf cfg.enable {
            # udev rule for HID access — no sudo needed to talk to the mouse
            services.udev.extraRules = ''
              # ASUS TUF Gaming M3 (VID 0x0B05 / PID 0x1910) — allow hidraw access
              SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b05", ATTRS{idProduct}=="1910", \
                MODE="0666", GROUP="input", TAG+="uaccess"
            '';

            # Install the binary system-wide
            environment.systemPackages = [ cfg.package ];

            # Systemd user service — auto-starts the tray app on graphical login
            systemd.user.services.asus-tuf-gaming-m3 = {
              description = "ASUS TUF Gaming M3 Mouse Controller";
              wantedBy = [ "graphical-session.target" ];
              partOf = [ "graphical-session.target" ];
              after = [ "graphical-session.target" ];
              serviceConfig = {
                ExecStart = "${cfg.package}/bin/asus-mouse-control-tauri";
                Restart = "on-failure";
                RestartSec = 5;
              };
            };
          };
        };
    };
}
