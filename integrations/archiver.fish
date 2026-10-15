status is-interactive; or return
set -q ARCHIVER_SESSION; and return
set -q ARCHIVER_CLI; or set -g ARCHIVER_CLI archiverctl
command -s "$ARCHIVER_CLI" >/dev/null; or begin; echo 'Archiver: archiverctl is required.' >&2; return; end
set -g ARCHIVER_SESSION ("$ARCHIVER_CLI" uuid)
set -g ARCHIVER_SEQUENCE 0
set -g ARCHIVER_SOURCE "Fish $version"
set -q WSL_DISTRO_NAME; and set -g ARCHIVER_SOURCE "WSL / $ARCHIVER_SOURCE"
set -g ARCHIVER_INSERTION false
function _archiver_session
 "$ARCHIVER_CLI" session "$ARCHIVER_SESSION" "$ARCHIVER_SOURCE" "$fish_pid" "$PWD" "$argv[1]" "$ARCHIVER_INSERTION" >/dev/null
end
function _archiver_preexec --on-event fish_preexec
 set -g ARCHIVER_SEQUENCE (math $ARCHIVER_SEQUENCE + 1)
 printf '%s' "$argv[1]" | "$ARCHIVER_CLI" begin "$ARCHIVER_SESSION" "$ARCHIVER_SEQUENCE" "$ARCHIVER_SOURCE" "$fish_pid" "$PWD" >/dev/null
 set -g ARCHIVER_PENDING $ARCHIVER_SEQUENCE
 _archiver_session false
end
function _archiver_postexec --on-event fish_postexec
 set -l code $status
 if set -q ARCHIVER_PENDING
  "$ARCHIVER_CLI" finish "$ARCHIVER_SESSION" "$ARCHIVER_PENDING" "$code" >/dev/null
  set -e ARCHIVER_PENDING
 end
 _archiver_session true
 return $code
end
function _archiver_insert
 # string collect -N preserves multiline text and trailing newlines.
 set -l request ("$ARCHIVER_CLI" take "$ARCHIVER_SESSION" | string collect -N)
 test -n "$request"; or return
 set -l parts (string split -m 1 \n -- "$request")
 test (count $parts) -eq 2; or return
 commandline --insert -- "$parts[2]"
 "$ARCHIVER_CLI" ack "$ARCHIVER_SESSION" "$parts[1]" >/dev/null
end
if not bind \cx\ca >/dev/null 2>&1
 bind \cx\ca _archiver_insert
 set -g ARCHIVER_INSERTION true
end
_archiver_session true
