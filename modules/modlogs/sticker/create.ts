import CONSTANTS from "../../../common/CONSTANTS.js";
import log from "../logging.js";

import type Event from "../../../common/types/event";

defineEvent("stickerCreate", async (partialSticker) => {
	const sticker = partialSticker.partial ? await partialSticker.fetch() : partialSticker;
	if (!sticker.guild || sticker.guild.id !== CONSTANTS.guild.id) return;
	await log(`🙂 Sticker ${sticker.name} created!`, "server");
});
