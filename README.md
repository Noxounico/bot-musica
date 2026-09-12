# Bot Música — NoxMusic

Bot de Discord com um painel ao estilo Spotify. **Os botões controlam o bot no Discord**, não a tua conta Spotify.

O áudio vem do YouTube (`play-dl` + `@discordjs/voice`). Não precisas de Spotify Premium, de ter o Spotify aberto, nem do scope `user-modify-playback-state`.

## Requisitos

- Node.js 22+
- [ffmpeg](https://ffmpeg.org/) (ou `ffmpeg-static` no `npm install`)
- Bot no [Discord Developer Portal](https://discord.com/developers/applications)
- (Opcional) App no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) só para arte e título

## Variáveis de ambiente

Copia `env.example` para `.env` e preenche:

| Variável | Descrição |
|----------|-----------|
| `DISCORD_TOKEN` | Token do bot Discord |
| `DISCORD_CLIENT_ID` | Application ID do bot |
| `DISCORD_GUILD_ID` | (Opcional) ID do servidor para registar comandos só aí |
| `SPOTIFY_CLIENT_ID` | (Opcional) Client ID — Search API, sem login |
| `SPOTIFY_CLIENT_SECRET` | (Opcional) Client Secret — Search API, sem login |

**Nunca commits o ficheiro `.env`.**

Não uses `SPOTIFY_REFRESH_TOKEN`. Esse fluxo pedia Premium e a app aberta.

## Configuração Discord

1. Cria uma aplicação em https://discord.com/developers/applications
2. Em **Bot**, gera um token → `DISCORD_TOKEN`
3. Intents: **Guilds** e **Guild Voice States**. Não ligues Message Content.
4. Em **OAuth2 → URL Generator**, scopes: `bot`, `applications.commands`
5. Permissões: `Connect`, `Speak`, `Use Voice Activity`
6. Convida o bot para o teu servidor

## Spotify (opcional)

O Client ID/Secret usam só `client_credentials` para procurar capa e título. Sem isto o bot toca na mesma: pesquisas o nome no YouTube.

## Executar

```bash
npm install
npm start
```

No Discord:

1. Entra num canal de voz
2. `/entrar` (menu `/`, não escrevas o texto à mão)
3. `/play` ou `/tocar` com o nome da música — ou um link do YouTube / Spotify
   Se o Discord mostrar o `/play` de outro bot, escolhe o **NoxMusic** ou usa `/tocar`.
4. O painel **é a mesma mensagem**: quando mudas de faixa (⏭, `/play`, playlist) o título, a capa e o texto atualizam ali.
5. `/add` mete na fila sem trocar a atual. `/volume 40` ou 🔉/🔊. `/playlist criar festa`.
6. No painel: ⏮ ▶/⏸ ⏭ 🔉 🔊 · Playlist · Shuffle · Clipe · Sair

`/sair` sai do voice. `/painel` volta a publicar o painel.

## Como funciona

1. `/play` aceita nome, link YouTube (`youtu.be` / `watch`) ou link Spotify.
2. Links `youtu.be?si=` são limpos para `youtube.com/watch?v=...`.
3. Se o YouTube recusar o stream (bot check), o bot tenta SoundCloud com o mesmo título.
4. Os botões avançam, recuam, pausam e retomam **a fila do Discord**.

## Limitações

- O áudio vem do YouTube (ou SoundCloud se o YouTube bloquear o servidor).
- Comandos escritos como texto (`/entrar` no chat) não funcionam: o bot não pede Message Content. Usa o menu `/`.

## Estrutura

```
src/
├── index.js      # Discord client e comandos
├── sync.js       # Fila local (play / pause / next / previous)
├── spotify.js    # Search API (client_credentials)
├── player.js     # Voz Discord + YouTube
├── panel.js      # Embed e botões
└── config.js
```
