import CONSTANTS from "../common/CONSTANTS.js";
import Database from "../common/database.js";

import type { Snowflake } from "discord.js";
import defineEvent from "../events.js";

export const rolesDatabase = new Database<{
	user: Snowflake;
	designer: boolean;
	scradd: boolean;
	formerAdmin: boolean;
	formerMod: boolean;
	dev: boolean;
	translator: boolean;
	contributor: boolean;
	epic: boolean;
	booster: boolean;
}>("roles");
await rolesDatabase.init();

const roles = {
	designer: "916020774509375528",
	scradd: "1008190416396484700",
	formerAdmin: "1069776422467555328",
	formerMod: "881623848137682954",
	dev: "806608777835053098",
	translator: "841696608592330794",
	contributor: "991413187427700786",
	epic: CONSTANTS.roles.epic?.id || "",
	booster: CONSTANTS.roles.booster?.id || "",
};

defineEvent("guildMemberRemove", async (member) => {
	if (member.guild.id !== CONSTANTS.guild.id) return;

	const databaseIndex = rolesDatabase.data.findIndex((entry) => entry.user === member.id);

	const memberRoles = {
		user: member.id,
		...Object.fromEntries(
			Object.entries(roles).map(([key, value]) => [key, !!member.roles.resolve(value)]),
		),
	};

	if (databaseIndex === -1) rolesDatabase.data = [...rolesDatabase.data, memberRoles];
	else {
		const allRoles = [...rolesDatabase.data];
		allRoles[databaseIndex] = memberRoles;
		rolesDatabase.data = allRoles;
	}
});

defineEvent("guildMemberAdd", async (member) => {
	if (member.guild.id !== CONSTANTS.guild.id) return;

	const memberRoles = rolesDatabase.data.find((entry) => entry.user === member.id);
	for (const roleName of Object.keys(roles))
		if (memberRoles?.[roleName]) member.roles.add(roles[roleName]);
});
