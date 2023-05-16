import { unifiedDiff } from "difflib";
import { time } from "discord.js";

import { client } from "../../../lib/client.js";
import config from "../../../common/config.js";
import constants from "../../../common/constants.js";
import log from "../logging.js";

import type Event from "../../../common/types/event";

defineEvent("guildScheduledEventUpdate", async (oldEvent, newEvent) => {
	const guild = newEvent.guild ?? (await client.guilds.fetch(newEvent.guildId));
	if (guild.id !== config.guild.id || !oldEvent) return;
	const logs = [];
	if (oldEvent.name !== newEvent.name) logs.push(`’s topic changed to \`${newEvent.name}\``);

	if (
		oldEvent.channel?.id !== newEvent.channel?.id ||
		oldEvent.entityMetadata?.location !== newEvent.entityMetadata?.location
	) {
		logs.push(
			` moved to ${
				oldEvent.channel?.toString() ??
				oldEvent.entityMetadata?.location ??
				"an external location"
			}`,
		);
	}

	if (oldEvent.description !== newEvent.description) {
		await log(`📆 Event ${oldEvent.name}’s description was changed!`, "voice", {
			files: [
				{
					attachment: Buffer.from(
						unifiedDiff(
							(oldEvent.description ?? "").split("\n"),
							(newEvent.description ?? "").split("\n"),
							{ lineterm: "" },
						)
							.join("\n")
							.replace(/^--- \n\+\+\+ \n/, ""),
						"utf8",
					),

					name: "description.diff",
				},
			],
		});
	}

	if (oldEvent.coverImageURL() !== newEvent.coverImageURL()) {
		const coverImageURL = newEvent.coverImageURL({ size: 128 });
		const response = coverImageURL && (await fetch(coverImageURL));
		await log(
			`📆 Event ${oldEvent.name}’s cover image was ${response ? "changed" : "removed"}!`,
			"voice",
			{ files: response ? [Buffer.from(await response.arrayBuffer())] : [] },
		);
	}

	if (
		oldEvent.scheduledStartAt?.valueOf() !== newEvent.scheduledStartAt?.valueOf() ||
		oldEvent.scheduledEndAt?.valueOf() !== newEvent.scheduledEndAt?.valueOf()
	) {
		const start = newEvent.scheduledStartAt;
		const end = newEvent.scheduledEndAt;
		logs.push(
			` rescheduled${
				start ?? end
					? ` to ${time(start ?? end ?? new Date())}${
							end && start ? `-${time(end)}` : ""
					  }`
					: ""
			}`,
		);
	}

	await Promise.all(
		logs.map(async (edit) => await log(`📆 Event ${oldEvent.name}${edit}!`, "voice")),
	);
});
