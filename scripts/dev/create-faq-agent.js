const path = require('path');
const { randomBytes } = require('crypto');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');
require('module-alias')({ base: path.resolve(__dirname, '..', '..', 'api') });
const { grantPermission } = require('~/server/services/PermissionService');
const { findUser, createAgent } = require('~/models');
const { silentExit } = require('../../config/helpers');
const connect = require('../../config/connect');

/**
 * Deloitte Custom Change: seeds an agent to use as the Learning Center FAQ agent so the
 * "Ask <agent>" menu item can be tested locally. Prints the id to put in
 * `LEARNING_CENTER_FAQ_AGENT_ID` (read by `interface.learningCenter.faqAgentId`).
 */
const usage = `Usage: npm run create-faq-agent -- --email=<owner-email> [--name="MyAssist FAQ"] [--provider=openAI] [--model=gpt-4o] [--id=agent_xxx] [--private]
Grants the owner full access and, unless --private is passed, public view access.`;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, ...rest] = arg.slice(2).split('=');
    flags[key] = rest.length ? rest.join('=') : true;
  }
  return { flags, positional };
}

(async () => {
  if (process.env.NODE_ENV === 'production') {
    console.red('Refusing to run: this is a local testing tool and NODE_ENV is production.');
    silentExit(1);
  }
  await connect();
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const email = typeof flags.email === 'string' ? flags.email : positional[0];

  if (!email) {
    console.orange(usage);
    silentExit(1);
  }

  const user = await findUser({ email: email.trim().toLowerCase() });
  if (!user) {
    console.red(`No user found with email ${email}. Create one with: npm run create-user`);
    silentExit(1);
  }

  const id = typeof flags.id === 'string' ? flags.id : `agent_${randomBytes(16).toString('base64url')}`;
  const agent = await createAgent({
    id,
    name: typeof flags.name === 'string' ? flags.name : 'MyAssist FAQ',
    description: 'Answers questions about using MyAssist.',
    instructions: 'You answer questions about how to use this platform, concisely and accurately.',
    provider: typeof flags.provider === 'string' ? flags.provider : 'openAI',
    model: typeof flags.model === 'string' ? flags.model : 'gpt-4o',
    tools: [],
    author: user._id,
  });

  const grants = [
    {
      principalType: PrincipalType.USER,
      principalId: user._id,
      resourceType: ResourceType.AGENT,
      accessRoleId: AccessRoleIds.AGENT_OWNER,
    },
  ];
  if (!flags.private) {
    grants.push({
      principalType: PrincipalType.PUBLIC,
      principalId: null,
      resourceType: ResourceType.AGENT,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
    });
  }
  await Promise.all(
    grants.map((grant) =>
      grantPermission({ ...grant, resourceId: agent._id, grantedBy: user._id }),
    ),
  );

  console.green(`Created FAQ agent "${agent.name}" (${agent.id})`);
  console.purple('Set this in your .env, then restart the backend:');
  console.cyan(`LEARNING_CENTER_FAQ_AGENT_ID=${agent.id}`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});
