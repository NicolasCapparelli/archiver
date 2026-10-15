#!/bin/sh
# Run with a native archiverctl binary, or archiverctl.exe in WSL.
# Stable copies and managed profile blocks; no command history is evaluated.
set -eu
cli=${1:?Usage: sh install-unix.sh /absolute/path/to/archiverctl[.exe]}
case "$cli" in /*) ;; *) echo 'Use an absolute CLI path.' >&2; exit 1;; esac
[ -f "$cli" ] || { echo 'CLI binary not found.' >&2; exit 1; }
base="${XDG_DATA_HOME:-$HOME/.local/share}/archiver/integrations"
case "$base:$HOME" in *"'"*) echo 'A single quote in the installation path is unsupported.' >&2; exit 1;; esac
mkdir -p "$base" "$HOME/.local/bin" "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp "$here/archiver.bash" "$here/archiver.zsh" "$here/archiver.fish" "$base/"
name=archiverctl; case "$cli" in *.exe) name=archiverctl.exe;; esac
cp "$cli" "$HOME/.local/bin/$name"; chmod +x "$HOME/.local/bin/$name"
managed() {
 path=$1; shell=$2; adapter=$3
 [ ! -f "$path" ] || [ -e "$path.archiver-backup" ] || cp "$path" "$path.archiver-backup"
 [ -f "$path" ] || : > "$path"
 awk '/^# BEGIN ARCHIVER$/{skip=1;next}/^# END ARCHIVER$/{skip=0;next}!skip{print}' "$path" > "$path.archiver-pending"
 printf '\n# BEGIN ARCHIVER\n' >> "$path.archiver-pending"
 if [ "$shell" = fish ]; then printf "set -gx ARCHIVER_CLI '%s'\nsource '%s'\n" "$HOME/.local/bin/$name" "$base/$adapter" >> "$path.archiver-pending"
 else printf "export ARCHIVER_CLI='%s'\nsource '%s'\n" "$HOME/.local/bin/$name" "$base/$adapter" >> "$path.archiver-pending"; fi
 printf '# END ARCHIVER\n' >> "$path.archiver-pending"
 mv "$path.archiver-pending" "$path"
}
managed "$HOME/.bashrc" bash archiver.bash
managed "${ZDOTDIR:-$HOME}/.zshrc" zsh archiver.zsh
managed "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/archiver.fish" fish archiver.fish
printf '%s\n' 'Archiver hooks installed. Restart your shells. Existing profiles were backed up.'
