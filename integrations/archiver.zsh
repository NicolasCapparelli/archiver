[[ -o interactive && -z ${ARCHIVER_SESSION:-} ]] || return
: ${ARCHIVER_CLI:=archiverctl}
command -v "$ARCHIVER_CLI" >/dev/null || { print -u2 'Archiver: archiverctl is required.'; return; }
typeset -g ARCHIVER_SESSION=$("$ARCHIVER_CLI" uuid) ARCHIVER_SEQUENCE=0 ARCHIVER_SOURCE="Zsh $ZSH_VERSION" ARCHIVER_INSERTION=false
[[ -z ${WSL_DISTRO_NAME:-} ]] || ARCHIVER_SOURCE="WSL / $ARCHIVER_SOURCE"
_archiver_session() { "$ARCHIVER_CLI" session "$ARCHIVER_SESSION" "$ARCHIVER_SOURCE" "$$" "$PWD" "$1" "$ARCHIVER_INSERTION" >/dev/null; }
_archiver_preexec() {
 ((ARCHIVER_SEQUENCE+=1))
 printf '%s' "$1" | "$ARCHIVER_CLI" begin "$ARCHIVER_SESSION" "$ARCHIVER_SEQUENCE" "$ARCHIVER_SOURCE" "$$" "$PWD" >/dev/null
 ARCHIVER_PENDING=$ARCHIVER_SEQUENCE; _archiver_session false
}
_archiver_precmd() {
 local code=$?
 if [[ -n ${ARCHIVER_PENDING:-} ]]; then "$ARCHIVER_CLI" finish "$ARCHIVER_SESSION" "$ARCHIVER_PENDING" "$code" >/dev/null; unset ARCHIVER_PENDING; fi
 _archiver_session true
 return $code
}
_archiver_insert() {
 local request=$("$ARCHIVER_CLI" take "$ARCHIVER_SESSION"; printf '\001')
 request=${request%$'\001'}
 [[ $request == *$'\n'* ]] || return
 local id=${request%%$'\n'*} payload=${request#*$'\n'}
 LBUFFER+=$payload
 "$ARCHIVER_CLI" ack "$ARCHIVER_SESSION" "$id" >/dev/null
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec _archiver_preexec
# First observer must see the original status; other prompt hooks are retained.
precmd_functions=(_archiver_precmd ${precmd_functions:#_archiver_precmd})
zle -N _archiver_insert
if [[ $(bindkey '^X^A') == *undefined-key* ]]; then bindkey '^X^A' _archiver_insert; ARCHIVER_INSERTION=true; fi
_archiver_session true
