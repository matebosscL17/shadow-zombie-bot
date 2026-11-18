/*
 * [~*| SHADOW |*~] Discord naplo - Zombie Plague 4.3
 * -------------------------------------------------------------
 * Osszegyujti a fontos szerver esemenyeket (kitiltas, nemitas, rang,
 * boss, palyavaltas), es a Discord bot RCON-on keresztul elkeri oket
 * a "shadow_dc_naplo" paranccsal, majd kiirja a szerver-naplo csatornaba.
 *
 * A tobbi SHADOW plugin igy kuld ide esemenyt:
 *     callfunc_begin("shadow_dc_add", "shadow_discord.amxx")
 *     callfunc_push_str(szoveg)
 *     callfunc_end()
 * Ha ez a plugin nincs fent, a tobbi plugin hiba nelkul megy tovabb.
 *
 * Beallitas:
 *   shadow_dc_belepes 0 - be- es kilepesek kiirasa is (1 = igen)
 */
#include <amxmodx>

#define MAX_SOR 100

new Array:g_aSorok
new g_pBelepes

public plugin_init()
{
	register_plugin("[~*| SHADOW |*~] Discord naplo", "1.0", "[~*| SHADOW |*~]")

	g_aSorok = ArrayCreate(256, 16)
	g_pBelepes = register_cvar("shadow_dc_belepes", "0")

	// csak a szerver konzolbol / RCON-bol hivhato
	register_srvcmd("shadow_dc_naplo", "cmd_Naplo")
}

public plugin_cfg()
{
	new m[32]
	get_mapname(m, charsmax(m))
	Hozzaad("🗺️ Pálya betöltve: **%s**", m)
}

public plugin_end()
	ArrayDestroy(g_aSorok)

// mas pluginok ezt hivjak
public shadow_dc_add(const szoveg[])
{
	Hozzaad("%s", szoveg)
}

Hozzaad(const fmt[], any:...)
{
	static sor[256], ido[8]
	get_time("%H:%M", ido, charsmax(ido))
	vformat(sor, charsmax(sor), fmt, 2)
	format(sor, charsmax(sor), "`%s` %s", ido, sor)

	if (ArraySize(g_aSorok) >= MAX_SOR)
		ArrayDeleteItem(g_aSorok, 0)
	ArrayPushString(g_aSorok, sor)
}

public cmd_Naplo()
{
	static sor[256]
	new n = ArraySize(g_aSorok)
	for (new i = 0; i < n; i++)
	{
		ArrayGetString(g_aSorok, i, sor, charsmax(sor))
		server_print("SDC|%s", sor)
	}
	ArrayClear(g_aSorok)
	server_print("SDC_VEGE")
	return PLUGIN_HANDLED
}

public client_putinserver(id)
{
	if (!get_pcvar_num(g_pBelepes) || is_user_bot(id) || is_user_hltv(id)) return
	new nev[32]
	get_user_name(id, nev, charsmax(nev))
	Hozzaad("➡️ Belépett: **%s**", nev)
}

public client_disconnected(id)
{
	if (!get_pcvar_num(g_pBelepes) || is_user_bot(id) || is_user_hltv(id)) return
	new nev[32]
	get_user_name(id, nev, charsmax(nev))
	Hozzaad("⬅️ Kilépett: **%s**", nev)
}
