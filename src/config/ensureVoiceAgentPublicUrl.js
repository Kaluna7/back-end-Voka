const { spawn } = require('child_process');
const { getEnv } = require('./env');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const fetchNgrokTunnels = async () => {
  try {
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (!response.ok) {
      return [];
    }
    const body = await response.json();
    return Array.isArray(body?.tunnels) ? body.tunnels : [];
  } catch {
    return [];
  }
};

const pickHttpsPublicUrl = (tunnels, port) => {
  const portToken = `:${Number(port)}`;
  const httpsTunnels = tunnels.filter(t => String(t?.public_url || '').startsWith('https://'));
  const matching = httpsTunnels.find(t => String(t?.config?.addr || '').includes(portToken));
  return (matching || httpsTunnels[0])?.public_url || '';
};

/**
 * Spawn ngrok without crashing the parent on missing binary (Windows npm shim).
 * Prefer ngrok.cmd + shell on win32 so PATH/npm shims resolve.
 */
const spawnNgrok = port =>
  new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const command = isWin ? 'ngrok.cmd' : 'ngrok';
    const args = ['http', String(port), '--log=stdout', '--host-header=rewrite'];
    let settled = false;
    const fail = error => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    let child;
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: isWin,
      });
    } catch (error) {
      fail(error);
      return;
    }
    child.once('error', fail);
    // Successful spawn: detach and continue; tunnel readiness is polled via :4040.
    child.unref();
    setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(child);
    }, 250);
  });

/**
 * Deepgram Voice Agent BYO LLM requires a public HTTPS URL.
 * When VOICE_AGENT_PUBLIC_BASE_URL / THINK_URL are unset, optionally start ngrok
 * and publish the tunnel URL into process.env for this process.
 */
const ensureVoiceAgentPublicUrl = async (port = Number(process.env.PORT || 5000)) => {
  const thinkUrl = String(getEnv('VOICE_AGENT_THINK_URL', '') || '').trim();
  const publicBase = String(getEnv('VOICE_AGENT_PUBLIC_BASE_URL', '') || '').trim();
  if (thinkUrl || publicBase) {
    return {
      ok: true,
      url: (publicBase || thinkUrl).replace(/\/$/, ''),
      source: 'env',
      thinkUrl: thinkUrl || null,
    };
  }

  const provider = String(getEnv('VOICE_PROVIDER', 'deepgram-agent') || 'deepgram-agent')
    .trim()
    .toLowerCase();
  if (provider === 'legacy' || provider === 'classic' || provider === 'voka') {
    return { ok: true, url: '', source: 'skipped-legacy' };
  }

  const autoTunnel = String(getEnv('VOICE_AGENT_AUTO_TUNNEL', 'true') || 'true').toLowerCase() !== 'false';
  if (!autoTunnel) {
    console.warn(
      '[voice-agent] VOICE_AGENT_PUBLIC_BASE_URL missing and VOICE_AGENT_AUTO_TUNNEL=false — deepgram-agent will fall back to legacy',
    );
    return { ok: false, url: '', source: 'disabled' };
  }

  let tunnels = await fetchNgrokTunnels();
  let url = pickHttpsPublicUrl(tunnels, port);
  if (!url) {
    try {
      console.log(`[voice-agent] starting ngrok tunnel to port ${port}…`);
      await spawnNgrok(port);
    } catch (error) {
      console.warn(
        '[voice-agent] failed to spawn ngrok:',
        error?.message || error,
        '(install ngrok CLI / ensure it is on PATH, or set VOICE_AGENT_PUBLIC_BASE_URL)',
      );
      return { ok: false, url: '', source: 'spawn-failed', error };
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(400);
      tunnels = await fetchNgrokTunnels();
      url = pickHttpsPublicUrl(tunnels, port);
      if (url) {
        break;
      }
    }
  }

  if (!url) {
    console.warn(
      '[voice-agent] ngrok tunnel unavailable. Set VOICE_AGENT_PUBLIC_BASE_URL (or install/auth ngrok) so Deepgram can reach the LLM gateway.',
    );
    return { ok: false, url: '', source: 'timeout' };
  }

  process.env.VOICE_AGENT_PUBLIC_BASE_URL = url.replace(/\/$/, '');
  console.log(`[voice-agent] public base URL ready (${url}) — Deepgram think callbacks enabled`);
  return { ok: true, url: process.env.VOICE_AGENT_PUBLIC_BASE_URL, source: 'ngrok' };
};

module.exports = {
  ensureVoiceAgentPublicUrl,
};
