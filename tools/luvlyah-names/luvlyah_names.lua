--[[
  luvlyah_names (optional helper for the LuvlyAH Ledger website)

  The auction house search service only knows item ids. Names normally come from the
  server's item list, which has no apostrophes and can differ from the game. This
  addon writes the names exactly as your game client shows them.

  1. Copy this file to  <Ashita>\addons\luvlyah_names\luvlyah_names.lua
  2. In game:  /addon load luvlyah_names   then   /lahnames
  3. Copy  <Ashita>\config\addons\luvlyah_names\names.json  into the repository as  data/names.json
]]

addon.name    = 'luvlyah_names'
addon.author  = 'LuvlyAH Ledger'
addon.version = '1.0'
addon.desc    = 'Exports item names for the LuvlyAH Ledger website (/lahnames).'
addon.link    = ''

require('common')

local NOAUCTION = 0x0020

local function esc(s)
    return (s:gsub('[%c"\\]', function(c)
        if c == '"' then return '\\"' end
        if c == '\\' then return '\\\\' end
        return ''
    end))
end

ashita.events.register('command', 'lahnames_cmd', function(e)
    local args = e.command:args()
    if #args == 0 or args[1]:lower() ~= '/lahnames' then return end
    e.blocked = true

    local res = AshitaCore:GetResourceManager()
    local out, n = {}, 0
    for id = 1, 40000 do
        local ok, it = pcall(function() return res:GetItemById(id) end)
        if ok and it then
            local okn, name = pcall(function() return it.Name and it.Name[1] end)
            if okn and type(name) == 'string' and name ~= '' and name:sub(1, 1) ~= '.' then
                local flags = 0
                pcall(function() flags = it.Flags or 0 end)
                if bit.band(flags, NOAUCTION) == 0 then
                    local stack = 1
                    pcall(function() stack = it.StackSize or 1 end)
                    out[#out + 1] = string.format('"%d":["%s",%d]', id, esc(name), stack)
                    n = n + 1
                end
            end
        end
    end

    local dir = AshitaCore:GetInstallPath() .. 'config\\addons\\luvlyah_names\\'
    pcall(function() ashita.fs.create_dir(dir) end)
    local path = dir .. 'names.json'
    local f = io.open(path, 'w')
    if not f then
        print('[luvlyah_names] could not write ' .. path)
        return
    end
    f:write('{', table.concat(out, ','), '}')
    f:close()
    print(string.format('[luvlyah_names] wrote %d item names to %s', n, path))
end)
