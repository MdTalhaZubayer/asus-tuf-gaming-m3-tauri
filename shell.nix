# shell.nix
# This file provides compatibility for nix-shell. 
# It delegates to the flake's devShell to ensure consistency.

let
  flake = builtins.getFlake (toString ./.);
  system = builtins.currentSystem;
  pkgs = import (flake.inputs.nixpkgs) { inherit system; };
in
  flake.devShells.${system}.default
