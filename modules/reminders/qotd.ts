import { ComponentType, type ChatInputCommandInteraction, TextInputStyle } from "discord.js";
import { SpecialReminders, remindersDatabase } from "./misc.js";
import { client } from "strife.js";
import mongoose from "mongoose";
import config from "../../common/config.js";
import { paginate } from "../../util/discord.js";
import constants from "../../common/constants.js";

export const Question = mongoose.model(
	"question",
	new mongoose.Schema({ question: String, emojis: Boolean }),
);
export default async function sendQOTD() {
	if (!config.channels.qotd) throw new ReferenceError("Could not find QOTD channel");
	remindersDatabase.data = [
		...remindersDatabase.data,
		{
			channel: config.channels.qotd.id,
			date: Date.now() + 1, // 86_400_000
			reminder: undefined,
			id: SpecialReminders.QOTD,
			user: client.user.id,
		},
	];

	const questions = await Question.find();

	const random = Math.floor(Math.random() * questions.length);
	const question = questions[random]?.question;

	if (!question) return;

	const post = await config.channels.qotd.threads.create({
		name: `Question of The Day ${new Date().toISOString().split("T")[0]}`,
		message: { content: question },
		reason: "For today’s QOTD",
	});

	if (questions[random]?.emojis) {
		const message = await post.fetchStarterMessage();

		message?.react("👍");
		message?.react("👎");
	}

	await Question.findOneAndDelete({ question });
}

export async function addQOTD(interaction: ChatInputCommandInteraction) {
	await interaction.showModal({
		title: "Add QOTD",
		customId: interaction.id,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						style: TextInputStyle.Short,
						label: "Question",
						required: true,
						customId: "question",
					},
					{
						type: ComponentType.TextInput,
						style: TextInputStyle.Short,
						label: "Add emojis?",
						required: true,
						customId: "type",
					},
				],
			},
		],
	});

	const modalInteraction = await interaction
		.awaitModalSubmit({
			time: constants.collectorTime,
			filter: (modalInteraction) => modalInteraction.customId === interaction.id,
		})
		.catch(() => void 0);

	if (!modalInteraction) return;

	const question = modalInteraction.fields.getTextInputValue("question");
	const type = modalInteraction.fields.getTextInputValue("type");

	if (type != "true" && type != "false") {
		modalInteraction.reply({
			content: "Emojis must be true or false",
			ephemeral: true,
		});
		return;
	}

	await new Question({ question, type }).save();

	await modalInteraction.reply({
		content: "Added question.",
		embeds: [{ title: question }],
		ephemeral: true,
	});
}

export async function listQOTDs(interaction: ChatInputCommandInteraction) {
	const questions = await Question.find();
	await paginate(
		questions,
		async (question) => `${question.question}`,
		(data) => interaction.reply(data),
		{
			title: "All QOTD's.",
			singular: "question",
			failMessage: "No QOTD's.",
			user: interaction.user,
			ephemeral: true,
			perPage: 10,
			totalCount: questions.length,
		},
	);
}
