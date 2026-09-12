# Bot Música — espelha o Spotify no Discord

Bot de Discord que segue a tua reprodução no Spotify (estilo AxeyBot): quando mudas música, pausas, retomas ou avanças no Spotify, o bot no canal de voz faz o mesmo.

O áudio é reproduzido via YouTube (pesquisa pelo artista e título da faixa no Spotify). O Spotify não permite streaming direto para bots de terceiros.

## Requisitos

- Node.js 20+
- [ffmpeg](https://ffmpeg.org/) instalado no sistema
- Conta Spotify (Premium recomendada para controlo de reprodução fiável)
- Bot no [Discord Developer Portal](https://discord.com/developers/applications)
- App no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## Variáveis de ambiente

Copia `.env.example` para `.env` e preenche:

| Variável | Descrição |
|----------|-----------|
| `DISCORD_TOKEN` | Token do bot Discord |
| `DISCORD_CLIENT_ID` | Application ID do bot (para limpar slash commands antigos) |
| `DISCORD_GUILD_ID` | (Opcional) ID do servidor para registar comandos só aí durante testes |
| `SPOTIFY_CLIENT_ID` | Client ID da app Spotify |
| `SPOTIFY_CLIENT_SECRET` | Client Secret da app Spotify |
| `SPOTIFY_REFRESH_TOKEN` | Obtido com `npm run auth:spotify` |
| `SPOTIFY_POLL_MS` | Intervalo de polling ao Spotify (default: 2000 ms) |

**Nunca commits o ficheiro `.env`.**

## Configuração Discord

1. Cria uma aplicação em https://discord.com/developers/applications
2. Em **Bot**, gera um token → `DISCORD_TOKEN`
3. Permissões do bot: **Connect** e **Speak**. Usa `/entrar` no menu do Discord.
4. Em **OAuth2 → URL Generator**, scopes: `bot`, `applications.commands`
5. Permissões do bot: `Connect`, `Speak`, `Use Voice Activity`
6. Convida o bot para o teu servidor

## Configuração Spotify

1. Cria uma app em https://developer.spotify.com/dashboard
2. Em **Settings**, adiciona Redirect URI: `http://localhost:8888/callback`
3. Copia Client ID e Client Secret para o `.env`
4. Na pasta `bot-musica`:

```bash
npm install
npm run auth:spotify
```

5. Abre o URL que aparece, autoriza com a conta Spotify que queres espelhar
6. Copia o `SPOTIFY_REFRESH_TOKEN` impresso no terminal para o `.env`

## Executar

```bash
cd bot-musica
npm install
npm start
```

No Discord:

- `/entrar` — entra no voice (fones cortados) e abre o painel Spotify
- `/painel` — volta a publicar o painel
- `/sair` — sai do voice
- No painel: ⏮ ▶/⏸ ⏭ e **Sair**

Os botões controlam a tua conta Spotify. Depois de atualizar o bot, volta a autorizar em `/spotify` (novos scopes).

## Como funciona

1. O bot faz polling ao endpoint [Get Playback State](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback) da Spotify Web API.
2. Deteta mudanças de faixa, play/pause e volume.
3. Para cada faixa, procura um vídeo equivalente no YouTube e reproduz no canal de voz com `@discordjs/voice`.

## Limitações

- O áudio vem do YouTube, não do Spotify — pode não ser exatamente a mesma versão.
- O seek ao mudar de faixa é aproximado (depende do `play-dl`/ffmpeg).
- Precisas de Spotify ativo (app ou web) a tocar na conta autorizada.
- Premium facilita controlo remoto consistente.

## Estrutura

```
bot-musica/
├── src/
│   ├── index.js      # Discord client e comandos
│   ├── sync.js       # Loop de espelhamento
│   ├── spotify.js    # Cliente Spotify API
│   ├── player.js     # Voz Discord + YouTube
│   └── config.js
├── scripts/
│   └── spotify-auth.js
├── .env.example
└── package.json
```
