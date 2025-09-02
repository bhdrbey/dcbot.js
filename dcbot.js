// index.js
// Özellikler:
// .ship [@user?] — Rastgele eşleştirir veya komut sahibi ile belirtilen kullanıcıyı eşleştirir.
// .dc18 <doğruluk|cesaretlik|karışık> — +18 Doğruluk/Cesaretlik soruları.
// DM'den .itiraf <yazınız> — İtirafı siyah kenarlıklı görsel olarak İTİRAF kanalına yollar.

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CONFESSION_CHANNEL_ID = process.env.CONFESSION_CHANNEL_ID;

if (!TOKEN || !GUILD_ID || !CONFESSION_CHANNEL_ID) {
  console.error('Lütfen .env dosyasında DISCORD_TOKEN, GUILD_ID ve CONFESSION_CHANNEL_ID ayarlayın.');
  process.exit(1);
}

const PREFIX = '.';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ---- Yardımcılar ----
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function drawBlackFramedCard({ width = 900, height = 480, title = '', subtitle = '', leftImg, rightImg, centerImg, footer = '', attachImg }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  const pad = 16;
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(pad, pad, width - pad * 2, height - pad * 2);

  ctx.lineWidth = 24;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(12, 12, width - 24, height - 24);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px sans-serif'; // Başlık büyütüldü
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, 70);

  if (subtitle) {
    ctx.font = 'bold 32px sans-serif'; // Alt yazı büyütüldü
    ctx.fillStyle = '#ddd';
    ctx.fillText(subtitle, width / 2, 120);
  }

  const avatarSize = 200;
  const y = height / 2 + 10;
  if (leftImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(190, y - 10, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(leftImg, 90, y - 110, avatarSize, avatarSize);
    ctx.restore();
  }
  if (rightImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(width - 190, y - 10, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(rightImg, width - 290, y - 110, avatarSize, avatarSize);
    ctx.restore();
  }

  if (centerImg) {
    const cW = 140, cH = 140;
    ctx.drawImage(centerImg, (width - cW) / 2, y - 75, cW, cH);
  }

  if (attachImg) {
    const aw = width - pad * 4;
    const ah = 120;
    const ax = (width - aw) / 2;
    const ay = height - ah - 24;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(ax, ay, aw, ah);
    const ratio = Math.min(aw / attachImg.width, ah / attachImg.height);
    const iw = attachImg.width * ratio;
    const ih = attachImg.height * ratio;
    ctx.drawImage(attachImg, ax + (aw - iw) / 2, ay + (ah - ih) / 2, iw, ih);
  }

  if (footer) {
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.fillText(footer, width / 2, height - 12);
  }

  return canvas;
}

async function avatar(user) {
  const url = user.displayAvatarURL({ extension: 'png', size: 256 });
  return await loadImage(url);
}

async function imageFromAttachment(att) {
  try {
    if (!att) return null;
    return await loadImage(att.url);
  } catch {
    return null;
  }
}

// ---- Doğruluk/Cesaretlik +18 ----
const TRUTH_18 = [
  'Burda Tip olarak hoşlandığın kişinin ilgini çeken yerlerini söyle.',
  'Buradan birisini öldürüp birisi ile yatıp birisini çöpe at.',
  'Bize fetişlerinden bahset yoksa da bir fantezini anlat?',
  'Bir ilişkide kırmızı çizgin nedir ve neden?',
  'En sert sevişmeni anlat?',
  'Eski bir sevgiliyi hâlâ stalklıyor musun? En son ne gördün?',
  'Buradan hoşlandığın kişi var mı?' ,
  'İki kişiyi çiftleştir.',
];

const DARE_18 = [
  'Karşındaki kişinin en çekici bulduğun 3 özelliğini söyle.',
  'Ayaklarının resmini herkese at',
  'Birine isimsiz bir iltifat DM’i at ve ekran görüntüsünü anlat (SS atma).',
  '30 saniye boyunca en flörtöz halinle konuş.',
  'Burada bulunan birine nude yolla (sadece o görecek sonra silinecek)',
  'Burdan birisi ile sevgili ol (en kötü 1 gün olmak zorunlu)',
  'Random birisine sevişmek istediğini söyle',
];

function pickDC18(type) {
  if (type === 'truth') return `**Doğruluk:** ${TRUTH_18[rnd(0, TRUTH_18.length - 1)]}`;
  if (type === 'dare') return `**Cesaretlik:** ${DARE_18[rnd(0, DARE_18.length - 1)]}`;
  const bucket = Math.random() < 0.5 ? TRUTH_18 : DARE_18;
  const label = bucket === TRUTH_18 ? 'Doğruluk' : 'Cesaretlik';
  return `**${label}:** ${bucket[rnd(0, bucket.length - 1)]}`;
}

// ---- Mesaj Olayı ----
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;

    // İtiraf (sadece DM)
    if (msg.channel?.isDMBased?.()) {
      const content = msg.content?.trim() || '';
      if (!content.toLowerCase().startsWith('.itiraf')) return;

      const text = content.replace(/^\.itiraf\s*/i, '').trim();
      if (!text && msg.attachments.size === 0) {
        return msg.reply('Lütfen `.itiraf <mesajınız>` şeklinde yazın veya bir resim ekleyin.');
      }

      const attach = msg.attachments.first();
      const attachImg = await imageFromAttachment(attach);

      const canvas = await drawBlackFramedCard({
        title: 'İTİRAF',
        width: 900,
        height: 540,
        attachImg,
      });

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif'; // İtiraf metni büyütüldü
      ctx.textAlign = 'center';
      const maxWidth = 820;
      const startY = 160;
      const lineHeight = 40;
      function wrapText(text, x, y) {
        const words = text.split(/\s+/);
        let line = '';
        let yy = y;
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth) {
            ctx.fillText(line, x, yy);
            line = words[n] + ' ';
            yy += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, x, yy);
      }
      wrapText(text || '(Görsel itiraf)', canvas.width / 2, startY);

      const file = new AttachmentBuilder(await canvas.encode('png'), { name: 'itiraf.png' });
      const channel = await client.channels.fetch(CONFESSION_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        return msg.reply('İtiraf kanalı bulunamadı.');
      }
      const embed = new EmbedBuilder()
        .setTitle('Anonim İtiraf')
        .setDescription('Yeni bir itiraf geldi. 🖤')
        .setColor(0x000000)
        .setImage('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQxKV-fKQHr0Z5dIlHUQ-NfViV-5sx0DzkBVA&s');
      await channel.send({ embeds: [embed], files: [file] });
      return msg.reply('İtirafın anonim şekilde gönderildi. 🖤');
    }

    // Normal prefixli komutlar
    if (!msg.content.startsWith(PREFIX)) return;
    const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // .ship
    if (command === 'ship') {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.members.fetch();
      let userA = msg.author;
      let userB = msg.mentions.users.first();
      if (!userB) {
        const candidates = guild.members.cache.filter(m => !m.user.bot && m.id !== userA.id);
        if (candidates.size === 0) return msg.reply('Eşleştirecek uygun üye bulunamadı.');
        userB = candidates.random().user;
      }
      const score = rnd(1, 100);
      const [leftImg, rightImg, heartImg] = await Promise.all([
        avatar(userA),
        avatar(userB),
        loadImage('https://www.hediyemen.com/Data/Blog/2/266.jpg').catch(() => null),
      ]);
      const canvas = await drawBlackFramedCard({
        title: `${userA.username} ❤ ${userB.username}`,
        subtitle: `Uyum Oranı: ${score}%`,
        leftImg, rightImg, centerImg: heartImg,
        footer: score >= 75 ? '💖 Yüksek uyum! Tanışma zamanı olabilir.' : 'Devam etmek ister misiniz? Tekrar deneyin!',
      });
      const file = new AttachmentBuilder(await canvas.encode('png'), { name: 'ship.png' });

      if (score >= 75) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tanis-${userA.id}-${userB.id}`)
            .setLabel('🤝 Tanışalım')
            .setStyle(ButtonStyle.Success)
        );
        return msg.reply({
          content: `\`${userA.tag}\` × \`${userB.tag}\` için sonuç: **${score}%**`,
          files: [file],
          components: [row],
        });
      }

      return msg.reply({ content: `\`${userA.tag}\` × \`${userB.tag}\` için sonuç: **${score}%**`, files: [file] });
    }

    // .dc18
    if (command === 'dc') {
      const type = args[0]?.toLowerCase() || 'mix';
      const q = pickDC18(type);
      const embed = new EmbedBuilder()
        .setTitle('Doğruluk / Cesaretlik +18')
        .setDescription(q)
        .setColor(0x000000);
      return msg.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    try { await msg.reply('Bir hata oluştu.'); } catch {}
  }
});

// ---- Buton Event ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId?.split('-') ?? [];
  const [prefix, idA, idB] = parts;
  if (prefix !== 'tanis' || !idA || !idB) return;

  try {
    const userA = await client.users.fetch(idA);
    const userB = await client.users.fetch(idB);

    await Promise.all([
      userA.send(`🤍 Sevgimiz 75 üzeri çıktı ${userB.tag} bana şans tanır mısın 🖤`),
      userB.send(`🤍 Sevgimiz 75 üzeri çıktı ${userA.tag} bana şans tanır mısın 🖤`)
    ]);

    await interaction.reply({
      content: 'Her iki kullanıcıya da tanışma mesajı gönderildi. 🖤',
      ephemeral: true,
    });
  } catch (err) {
    console.error(err);
    try {
      await interaction.reply({
        content: 'DM gönderilemedi. Kullanıcıların DM\'leri kapalı olabilir.',
        ephemeral: true,
      });
    } catch {}
  }
});
// ---- Ready Event ----
client.once('ready', () => {
  console.log(`✓ Giriş yapıldı: ${client.user.tag}`);

  // Botun durumunu ayarlıyoruz
  client.user.setPresence({
    activities: [
      {
        name: '.dc | .ship | DM: .itiraf <mesaj>',
        type: 0, // 0 = Playing
      },
    ],
    status: 'online',
  });
});

// ---- Login ----
client.login(TOKEN).catch(err => {
  console.error("Login hatası:", err);
});
