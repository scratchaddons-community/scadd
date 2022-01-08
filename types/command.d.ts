import { SlashCommandBuilder } from "@discordjs/builders";
import type { CacheType, CommandInteraction } from "discord.js";

type ComandInfo = {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
	interaction: (interaction: CommandInteraction<CacheType>) => Promise<void> | void;
};

export default ComandInfo;
