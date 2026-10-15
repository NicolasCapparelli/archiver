# Bash 4+ with emacs Readline. Standard Enter only; custom bindings are preserved.
[[ $- == *i* && -z ${ARCHIVER_SESSION:-} ]] || return
: "${ARCHIVER_CLI:=archiverctl}"
command -v "$ARCHIVER_CLI" >/dev/null || { printf '%s\n' 'Archiver: archiverctl is required.' >&2; return; }
ARCHIVER_SESSION=$("$ARCHIVER_CLI" uuid) || return
ARCHIVER_SEQUENCE=0
ARCHIVER_SOURCE="Bash ${BASH_VERSION}"
[[ -z ${WSL_DISTRO_NAME:-} ]] || ARCHIVER_SOURCE="WSL / $ARCHIVER_SOURCE"
_archiver_session() { "$ARCHIVER_CLI" session "$ARCHIVER_SESSION" "$ARCHIVER_SOURCE" "$$" "$PWD" "$1" "${ARCHIVER_INSERTION:-false}" >/dev/null; }
_archiver_begin() {
 [[ -n $READLINE_LINE ]] || return
 ((ARCHIVER_SEQUENCE+=1))
 printf '%s' "$READLINE_LINE" | "$ARCHIVER_CLI" begin "$ARCHIVER_SESSION" "$ARCHIVER_SEQUENCE" "$ARCHIVER_SOURCE" "$$" "$PWD" >/dev/null
 ARCHIVER_PENDING=$ARCHIVER_SEQUENCE
 _archiver_session false
}
_archiver_prompt() {
 local code=$?
 if [[ -n ${ARCHIVER_PENDING:-} ]]; then "$ARCHIVER_CLI" finish "$ARCHIVER_SESSION" "$ARCHIVER_PENDING" "$code" >/dev/null; unset ARCHIVER_PENDING; fi
 _archiver_session true
 return "$code"
}
_archiver_insert() {
 local request id payload
 # Sentinel preserves every trailing newline through command substitution.
 request=$("$ARCHIVER_CLI" take "$ARCHIVER_SESSION"; printf '\001')
 request=${request%$'\001'}
 [[ $request == *$'\n'* ]] || return
 id=${request%%$'\n'*}; payload=${request#*$'\n'}
 READLINE_LINE=${READLINE_LINE:0:READLINE_POINT}${payload}${READLINE_LINE:READLINE_POINT}
 ((READLINE_POINT+=${#payload}))
 "$ARCHIVER_CLI" ack "$ARCHIVER_SESSION" "$id" >/dev/null
}
# Never replace a user's custom Enter or insertion chord.
if bind -m emacs-standard -p | command grep -F '"\C-m": accept-line' >/dev/null; then
 if ! bind -m emacs-standard -s | command grep -F '"\C-x\C-h"' >/dev/null && ! bind -m emacs-standard -p | command grep -F '"\C-x\C-h":' >/dev/null; then
  bind -m emacs-standard -x '"\C-x\C-h":_archiver_begin'
  bind -m emacs-standard '"\C-m":"\C-x\C-h\C-j"'
 else printf '%s\n' 'Archiver: capture chord in use; Enter unchanged.' >&2; fi
else printf '%s\n' 'Archiver: custom Enter binding; capture unavailable.' >&2; fi
if ! bind -m emacs-standard -s | command grep -F '"\C-x\C-a"' >/dev/null && ! bind -m emacs-standard -p | command grep -F '"\C-x\C-a":' >/dev/null; then
 bind -m emacs-standard -x '"\C-x\C-a":_archiver_insert'; ARCHIVER_INSERTION=true
fi
# Prepend while retaining scalar or array prompt commands and their exit status.
if declare -p PROMPT_COMMAND 2>/dev/null | command grep -q 'declare -a'; then PROMPT_COMMAND=(_archiver_prompt "${PROMPT_COMMAND[@]}");
else PROMPT_COMMAND="_archiver_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"; fi
_archiver_session true
