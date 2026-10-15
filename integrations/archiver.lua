-- CMD prototype for Clink. Load using `clink installscripts <integrations directory>`.
-- Captures edited input without replacing it or changing Clink's history policy.
if not clink or not clink.onendedit or not os.createguid then return end
local base = os.getenv('LOCALAPPDATA')
if not base then print('Archiver: LOCALAPPDATA unavailable; CMD capture disabled.'); return end
local root = base .. '\\app.archiver.desktop'
local spool = root .. '\\shell-spool'
os.mkdir(root); os.mkdir(spool)
local session = os.createguid()
local sequence = 0
local pending_command
local function json_string(value)
    return '"' .. tostring(value):gsub('[%z\1-\31\\"]', function(c)
        if c == '\\' then return '\\\\' end
        if c == '"' then return '\\"' end
        return string.format('\\u%04x', string.byte(c))
    end) .. '"'
end
local sessions = root .. '\\shell-sessions'
os.mkdir(sessions)
local insertion = false
local function update_session(ready)
    local file = io.open(sessions .. '\\' .. session .. '.json', 'wb')
    if not file then return end
    file:write('{"session":' .. json_string(session) .. ',"source":"CMD (Clink)","pid":' .. tostring(os.getpid()) .. ',"directory":' .. json_string(os.getcwd()) .. ',"ready":' .. tostring(ready) .. ',"insertion":' .. tostring(insertion) .. ',"updatedAt":' .. tostring(os.time()*1000) .. '}')
    file:close()
end
function archiver_insert(rl_buffer)
    local path = root .. '\\insert-' .. session .. '.txt'
    local file = io.open(path, 'rb')
    if not file then return end
    local data = file:read('*a'); file:close(); os.remove(path)
    local request, expires, text = data:match('^([%x%-]+) (%d+)\n(.*)$')
    if not request or os.time() > tonumber(expires) then return end
    -- Edit the current Readline buffer only. Never call accept-line or enqueue input.
    rl_buffer:insert(text)
    local ack = io.open(path .. '.ack', 'wb')
    if ack then ack:write(request); ack:close() end
end
clink.onbeginedit(function()
    if pending_command and os.geterrorlevel and settings and settings.get('cmd.get_errorlevel') then
        local code = os.geterrorlevel()
        local event = '{"kind":"command_result","session":' .. json_string(session) .. ',"sequence":' .. tostring(pending_command.sequence) .. ',"exitCode":' .. tostring(code) .. ',"successful":' .. tostring(code == 0) .. ',"durationMs":' .. tostring(math.max(0, os.time() - pending_command.started)*1000) .. '}'
        local path = spool .. '\\' .. session .. '-' .. pending_command.sequence .. '-result.json'
        local file = io.open(path .. '.pending', 'wb')
        if file then file:write(event); file:close(); os.rename(path .. '.pending', path) end
    end
    pending_command = nil
    if rl and rl.getbinding and rl.setbinding and os.getpid then
        local key = [["\C-x\C-a"]]
        local binding = rl.getbinding(key)
        if not binding or binding == 'luafunc:archiver_insert' or binding == '"luafunc:archiver_insert"' then
            insertion = rl.setbinding(key, [["luafunc:archiver_insert"]])
        else
            insertion = false
        end
    end
    if os.getpid then update_session(true) end
end)
clink.onendedit(function(line)
    if os.getpid then update_session(false) end
    if not line or not line:match('%S') then return end
    local policy = io.open(root .. '\\capture-state.json', 'rb')
    if policy then
        local data = policy:read('*a'); policy:close()
        if data and data:find('"paused"%s*:%s*true') then return end
    end
    sequence = sequence + 1
    local event = '{"kind":"command","text":' .. json_string(line) .. ',"source":"CMD (Clink)","timestamp":' .. tostring(os.time() * 1000) .. ',"directory":' .. json_string(os.getcwd()) .. ',"session":' .. json_string(session) .. ',"sequence":' .. tostring(sequence) .. '}'
    local pending = spool .. '\\' .. session .. '-' .. sequence .. '.pending'
    local ready = spool .. '\\' .. session .. '-' .. sequence .. '.json'
    local file, failure = io.open(pending, 'wb')
    if not file then print('Archiver: command could not be saved: ' .. tostring(failure)); return end
    local written, write_failure = file:write(event)
    local closed, close_failure = file:close()
    if not written or not closed then print('Archiver: command write failed: ' .. tostring(write_failure or close_failure)); return end
    local moved, move_failure = os.rename(pending, ready)
    if moved then pending_command = { sequence = sequence, started = os.time() } end
    if not moved then print('Archiver: command publication failed: ' .. tostring(move_failure)) end
end)
