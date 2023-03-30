import Properties from "../utils/Properties";
import EventListener from "../modules/events/Event";
import Bot from "../Bot";

import {
    TextChannel,
    GuildMember,
    Message,
    User,
    ButtonBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    SelectMenuBuilder,
    ButtonStyle,
    Attachment,
    ButtonComponent,
    ActionRow
} from "discord.js";
import RoleUtils from "../utils/RoleUtils";
import BanRequest from "../utils/BanRequest";

module.exports = class MessageCreateEventListener extends EventListener {
    constructor(client: Bot) {
        super(client, {
            name: "messageCreate",
            once: false
        });
    }

    async execute(message: Message) {
        if (message.channelId === Properties.channels.winnerQueue) {
            if (message.reference) {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId as string);

                if (!referencedMessage.author.bot) return;
                if (referencedMessage.embeds.length === 0) return;

                const note = message.content;
                const hasNote = referencedMessage.embeds[0].fields[1]?.name.includes("Note");

                if (hasNote) {
                    referencedMessage.embeds[0].fields[1] = {
                        name: `Note (By ${message.author.tag})`,
                        value: note,
                        inline: false
                    };
                }
                else {
                    referencedMessage.embeds[0].fields.push({ name: `Note (By ${message.author.tag})`, value: note, inline: false });

                    const removeNote = new ButtonBuilder()
                        .setCustomId("removeWinnerRequestNote")
                        .setLabel("Remove Note")
                        .setStyle(ButtonStyle.Secondary)

                    if (!referencedMessage.content || !referencedMessage.components[0]) {
                        const actionRow = new ActionRowBuilder().setComponents([removeNote]);
                        referencedMessage.components.push(actionRow.data as ActionRow<ButtonComponent>);
                    } else {
                        referencedMessage.components[0].components.push(removeNote.data as ButtonComponent);
                    }
                }

                referencedMessage.edit({
                    embeds: referencedMessage.embeds,
                    components: referencedMessage.components
                })
                    .then(() => message.delete().catch(e => e))
                    .catch(console.error);

                return;
            }

            const winnerQueue = await message.guild?.channels.fetch(Properties.channels.winnerQueue) as TextChannel;
            if (!winnerQueue) return;

            const mentions = await message.guild?.members.fetch({ user: message.mentions.users?.map((user: User) => user.id) })

            if (mentions?.size === 0 || !mentions) {
                if (message.author.bot) return;

                const deleteMessage = new ButtonBuilder()
                    .setCustomId("deleteMessage")
                    .setLabel("Delete Reply")
                    .setStyle(ButtonStyle.Danger);

                const actionRow = new ActionRowBuilder().setComponents(deleteMessage);

                message.reply({
                    content: "There are no mentions in your message!",
                    components: [actionRow as ActionRowBuilder<ButtonBuilder>]
                }).catch(console.error);
                return;
            }

            const memberList = mentions?.map((member: GuildMember) => `${member} (\`${member.id}\`)`).join("\n");
            let winnerRoles = await message.guild?.roles.fetch();

            if (!winnerRoles) return;
            const winnerRoleList: { label: string, value: string }[] = []

            winnerRoles = await winnerRoles.filter((role) => role.name.includes("Winner") || role.name.includes("Champion") || role.name.includes("Master"));
            winnerRoles.forEach((role) => {
                const year = role.name.match(/\d{4}/g)?.[0];
                const winnerRole = {
                    label: role.name.replace(/\d+/g, "").trim(),
                    value: role.id
                }

                // @ts-ignore
                if (year) winnerRole.description = year;
                winnerRoleList.push(winnerRole);
            });

            const roleOptions = new SelectMenuBuilder()
                .setCustomId("selectWinnerRole")
                .setPlaceholder("Select a role to award...")
                .setOptions(winnerRoleList);

            const actionRow = new ActionRowBuilder().setComponents(roleOptions);

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: `Requested by ${message.author.tag} (${message.member?.displayName})`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setFields([{
                    name: "Winners",
                    value: memberList as string
                }])
                .setFooter({ text: `ID: ${message.author.id}` })
                .setTimestamp()

            if (message.author.id === this.client.user?.id) {
                const [roleId, messageUrl] = message.content.split(" | ");

                embed.data.fields?.push({
                    name: `Note (By ${this.client.user?.tag})`,
                    value: `Members that were unable to receive the <@&${roleId}> role in [another request](${messageUrl}).`,
                    inline: false
                })
            }

            winnerQueue.send({
                embeds: [embed],
                components: [actionRow as ActionRowBuilder<ButtonBuilder>]
            }).catch(console.error);

            message.delete().catch(console.error);
        }

        if(message.channel.id === Properties.channels.commands){
            if (message.author.bot) return;
            let logChannel = message.guild?.channels.cache.get(Properties.channels.mediaLogs) as TextChannel;

            if(message.attachments.size > 0){
                const attachments: Attachment[] = [];

                message.attachments.forEach(media => {
                    console.log(media)
                    attachments.push(media);
                });

                logChannel.send({content:`<t:${Math.trunc(message.createdTimestamp/1000)}:F> :park: ${message.author.username}#${message.author.discriminator} (\`${message.author.id}\`)`,  
                files: attachments,
                allowedMentions: undefined
            }).then(mediaLogMessage => {
                    let evidenceLinks = "";
                    mediaLogMessage.attachments.forEach( element => {
                        evidenceLinks += element.url + "\n"
                    })

                    message.channel.send(`${message.author} Your media links: \n ${evidenceLinks}`)

                    message.delete();
                })
            }
        }

        if(message.channel.id === Properties.channels.creations || message.channel.id === Properties.channels.avatars) {
            if (message.author.bot) return;

            message.react("275832913025564682")
                .then(() => message.react("♥️"))
                .then(() => message.react("😎"))
                .catch(() => {});
        }

        if(message.activity?.partyId?.includes("spotify")){
            if (message.guild === null) return;
            message.guild.members.fetch(message.author.id).then(member => {
                if (!RoleUtils.hasAnyRole(member, [RoleUtils.roles.trialModerator, RoleUtils.roles.moderator, RoleUtils.roles.seniorModerator, RoleUtils.roles.manager])) {
                    message.delete();
                }
            })
        }

        if (message.channel.id === Properties.channels.banRequestsQueue) await BanRequest.validate(message);
    }
}