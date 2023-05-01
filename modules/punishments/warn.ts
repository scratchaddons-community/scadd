import {
	ButtonInteraction,
	ButtonStyle,
	CacheType,
	ComponentType,
	escapeMarkdown,
	GuildMember,
	time,
	TimestampStyles,
	User,
} from "discord.js";
import client from "../../client.js";
import CONSTANTS from "../../common/CONSTANTS.js";
import { convertBase } from "../../util/numbers.js";
import log from "../modlogs/logging.js";
import giveXp from "../xp/giveXp.js";
import { DEFAULT_XP } from "../xp/misc.js";
import filterToStrike, {
	DEFAULT_STRIKES,
	EXPIRY_LENGTH,
	MUTE_LENGTHS,
	PARTIAL_STRIKE_COUNT,
	strikeDatabase,
	STRIKES_PER_MUTE,
} from "./misc.js";

export default async function warn(
	user: import("discord.js").GuildMember | import("discord.js").User,
	reason: string,
	strikes: number = DEFAULT_STRIKES,
	contextOrModerator: string | import("discord.js").User = client.user,
) {
	const allUserStrikes = strikeDatabase.data.filter(
		(strike) =>
			strike.user === user.id && strike.date + EXPIRY_LENGTH > Date.now() && !strike.removed,
	);

	const oldStrikeCount = allUserStrikes.reduce(
		(accumulator, { count }) => count + accumulator,
		0,
	);
	const oldMuteCount = Math.trunc(oldStrikeCount / STRIKES_PER_MUTE);
	const oldMuteLength = MUTE_LENGTHS.reduce(
		(accumulator, length, index) => (index < oldMuteCount ? accumulator + length : accumulator),
		0,
	);

	strikes = Math.max(Math.round(strikes * 4) / 4, PARTIAL_STRIKE_COUNT);
	const totalVerbalStrikes = Math.floor((oldStrikeCount % 1) + (strikes % 1));
	const displayStrikes = Math.trunc(strikes) + totalVerbalStrikes;
	const moderator = contextOrModerator instanceof User ? contextOrModerator : client.user;
	const context =
		(contextOrModerator instanceof User
			? ""
			: contextOrModerator + (totalVerbalStrikes ? "\n\n" : "")) +
		(totalVerbalStrikes ? "Too many verbal strikes" : "");

	const logMessage = await log(
		`⚠️ ${user.toString()} ${
			displayStrikes
				? `gained ${displayStrikes} strike${displayStrikes === 1 ? "" : "s"} from`
				: "verbally warned by"
		} ${moderator.toString()}!`,
		"members",
		{
			files: [
				{
					attachment: Buffer.from(reason + (context && `\n>>> ${context}`), "utf8"),
					name: "strike.txt",
				},
			],
		},
	);
	giveXp(user, logMessage.url, DEFAULT_XP * strikes * -1);

	const member =
		user instanceof GuildMember
			? user
			: await CONSTANTS.guild.members.fetch(user.id).catch(() => {});

	const id = convertBase(logMessage.id, 10, convertBase.MAX_BASE);

	await user
		.send({
			embeds: [
				{
					title: `You were ${
						displayStrikes
							? `warned${displayStrikes > 1 ? ` ${displayStrikes} times` : ""}`
							: "verbally warned"
					} in ${escapeMarkdown(CONSTANTS.guild.name)}!`,

					description: reason + (context && `\n>>> ${context}`),
					color: member?.displayColor,

					footer: {
						icon_url: CONSTANTS.guild.iconURL() ?? undefined,

						text: `Strike ${id}${
							displayStrikes
								? `${CONSTANTS.footerSeperator}Expiring in 21 ${
										process.env.NODE_ENV === "production" ? "day" : "minute"
								  }s`
								: ""
						}`,
					},
				},
			],
			components: CONSTANTS.channels.contact?.permissionsFor(user)?.has("ViewChannel")
				? [
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.Button,
									style: ButtonStyle.Primary,
									label: "Appeal Strike",
									custom_id: `${id}_appealStrike`,
								},
							],
						},
				  ]
				: [],
		})
		.catch(() => {});

	strikeDatabase.data = [
		...strikeDatabase.data,
		{ user: user.id, id, date: Date.now(), count: strikes, removed: false },
	];

	const totalStrikeCount = oldStrikeCount + strikes;

	if (Math.trunc(totalStrikeCount) > MUTE_LENGTHS.length * STRIKES_PER_MUTE + 1) {
		await (member?.bannable &&
		!member.roles.premiumSubscriberRole &&
		(process.env.NODE_ENV === "production" || member.roles.highest.name === "@everyone")
			? member.ban({ reason: "Too many strikes" })
			: log(`⚠️ Missing permissions to ban ${user.toString()}.`));
		return;
	}

	const totalMuteCount = Math.trunc(totalStrikeCount / STRIKES_PER_MUTE);
	const totalMuteLength = MUTE_LENGTHS.reduce(
		(accumulator, length, index) =>
			index < totalMuteCount ? accumulator + length : accumulator,
		0,
	);
	const addedMuteLength = totalMuteLength - oldMuteLength;

	if (addedMuteLength) {
		await (member?.moderatable
			? member.disableCommunicationUntil(
					addedMuteLength * (process.env.NODE_ENV === "production" ? 3_600_000 : 60_000) +
						Date.now(),
					"Too many strikes",
			  )
			: log(
					`⚠️ Missing permissions to mute ${user.toString()} for ${addedMuteLength} ${
						process.env.NODE_ENV === "production" ? "hour" : "minute"
					}${addedMuteLength === 1 ? "" : "s"}.`,
			  ));
	}

	if (Math.trunc(totalStrikeCount) > MUTE_LENGTHS.length * STRIKES_PER_MUTE) {
		await user.send(
			`__**This is your last chance. If you get another strike before ${time(
				new Date((allUserStrikes[0]?.date ?? Date.now()) + EXPIRY_LENGTH),
				TimestampStyles.LongDate,
			)}, you will be banned.**__`,
		);
	}
}
export async function removeStrike(interaction: ButtonInteraction<CacheType>, id: string) {
	const strike = id && (await filterToStrike(id));
	if (!strike) {
		return await interaction.reply({
			ephemeral: true,
			content: `${CONSTANTS.emojis.statuses.no} Invalid strike ID!`,
		});
	}

	if (strike.removed) {
		return await interaction.reply({
			ephemeral: true,
			content: `${CONSTANTS.emojis.statuses.no} That strike was already removed!`,
		});
	}

	strikeDatabase.data = strikeDatabase.data.map((toRemove) =>
		id === toRemove.id ? { ...toRemove, removed: true } : toRemove,
	);
	const user = (await client.users.fetch(strike.user).catch(() => {})) || `<@${strike.user}>`;
	const { url: logUrl } = await interaction.reply({
		fetchReply: true,
		content: `${CONSTANTS.emojis.statuses.yes} Removed ${user.toString()}’s strike \`${id}\`!`,
	});
	const member = await CONSTANTS.guild.members.fetch(strike.user).catch(() => {});
	if (
		member?.communicationDisabledUntil &&
		Number(member.communicationDisabledUntil) > Date.now()
	)
		await member.disableCommunicationUntil(Date.now());
	await log(
		`${CONSTANTS.emojis.statuses.yes} ${
			interaction.member
		} removed ${user.toString()}’s strike \`${id}\`!`,
		"members",
	);
	if (user instanceof User) await giveXp(user, logUrl, strike.count * DEFAULT_XP);
}
export async function addStrikeBack(interaction: ButtonInteraction<CacheType>, id: string) {
	const strike = id && (await filterToStrike(id));
	if (!strike) {
		return await interaction.reply({
			ephemeral: true,
			content: `${CONSTANTS.emojis.statuses.no} Invalid strike ID!`,
		});
	}

	if (!strike.removed) {
		return await interaction.reply({
			ephemeral: true,
			content: `${CONSTANTS.emojis.statuses.no} That strike was not removed!`,
		});
	}

	strikeDatabase.data = strikeDatabase.data.map((toRemove) =>
		id === toRemove.id ? { ...toRemove, removed: false } : toRemove,
	);
	const user = (await client.users.fetch(strike.user).catch(() => {})) || `<@${strike.user}>`;
	const { url: logUrl } = await interaction.reply({
		fetchReply: true,
		content: `${
			CONSTANTS.emojis.statuses.yes
		} Added ${user.toString()}’s strike \`${id}\` back!`,
	});
	const member = await CONSTANTS.guild.members.fetch(strike.user).catch(() => {});
	if (
		member?.communicationDisabledUntil &&
		Number(member.communicationDisabledUntil) > Date.now()
	)
		await member.disableCommunicationUntil(Date.now());
	await log(
		`${CONSTANTS.emojis.statuses.yes} ${
			interaction.member
		} added ${user.toString()}’s strike \`${id}\` back!`,
		"members",
	);
	if (user instanceof User) await giveXp(user, logUrl, -1 * strike.count * DEFAULT_XP);
}
