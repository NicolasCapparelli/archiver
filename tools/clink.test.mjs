import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function run(tail, binding = "") {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const setup = String.raw`
 files={}; callbacks={}; inserted={}; binding=${JSON.stringify(binding)}
 os.getenv=function()return 'TEST' end
 os.mkdir=function()return true end
 os.createguid=function()return '11111111-1111-4111-8111-111111111111' end
 os.getpid=function()return 123 end
 os.getcwd=function()return [[C:\project]] end
 tick=1000
 os.time=function()return tick end
 os.geterrorlevel=function()return 7 end
 settings={get=function(name)return name=='cmd.get_errorlevel' end}
 os.remove=function(path)files[path]=nil;return true end
 os.rename=function(from,to)files[to]=files[from];files[from]=nil;return true end
 io.open=function(path,mode)
  if mode=='rb' and not files[path] then return nil end
  if mode=='wb' then files[path]='' end
  return {read=function()return files[path] end,write=function(self,value)files[path]=files[path]..value;return self end,close=function()return true end}
 end
 clink={onbeginedit=function(fn)callbacks.begin=fn end,onendedit=function(fn)callbacks.finish=fn end}
 rl={getbinding=function()if binding=='' then return nil else return binding end end,setbinding=function(key,value)binding=value;return true end}
 `;
  const code =
    setup +
    "\n" +
    readFileSync(
      new URL("../integrations/archiver.lua", import.meta.url),
      "utf8",
    ) +
    "\n" +
    tail;
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  const error =
    status === lua.LUA_OK ? "" : to_jsstring(lua.lua_tostring(L, -1));
  lua.lua_close(L);
  assert.equal(error, "");
}
test("Clink inserts exact multiline Unicode once, acknowledges, rejects expired requests", () =>
  run(String.raw`
 callbacks.begin()
 local slash=string.char(92)
 local root='TEST'..slash..'app.archiver.desktop'
 local session=os.createguid()
 assert(files[root..slash..'shell-sessions'..slash..session..'.json']:find('"insertion":true',1,true))
 local path=root..slash..'insert-'..session..'.txt'
 local text=[[echo 日本語\path
next]]..'\n'
 files[path]='22222222-2222-4222-8222-222222222222 1005\n'..text
 local buffer={insert=function(self,value)table.insert(inserted,value)end}
 archiver_insert(buffer)
 assert(#inserted==1 and inserted[1]==text)
 assert(not files[path] and files[path..'.ack']=='22222222-2222-4222-8222-222222222222')
 archiver_insert(buffer);assert(#inserted==1)
 files[path]='22222222-2222-4222-8222-222222222222 999\nignored'
 archiver_insert(buffer);assert(#inserted==1)
 callbacks.finish('git status')
 assert(files[root..slash..'shell-sessions'..slash..session..'.json']:find('"ready":false',1,true))
 assert(files[root..slash..'shell-spool'..slash..session..'-1.json']:find('git status',1,true))
 tick=1002;callbacks.begin()
 local result=files[root..slash..'shell-spool'..slash..session..'-1-result.json']
 assert(result:find('"exitCode":7',1,true) and result:find('"successful":false',1,true) and result:find('"durationMs":2000',1,true))
 binding='changed-binding';callbacks.begin()
 assert(files[root..slash..'shell-sessions'..slash..session..'.json']:find('"insertion":false',1,true))
 `));
test("Clink preserves an existing insertion chord", () =>
  run(
    String.raw`
 callbacks.begin();assert(binding=='custom-binding')
 local slash=string.char(92)
 local path='TEST'..slash..'app.archiver.desktop'..slash..'shell-sessions'..slash..os.createguid()..'.json'
 assert(files[path]:find('"insertion":false',1,true))
 `,
    "custom-binding",
  ));
