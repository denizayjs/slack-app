const { App, LogLevel, SocketModeReceiver } = require('@slack/bolt');
const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const isoWeek = require('dayjs/plugin/isoWeek');
const utc = require('dayjs/plugin/utc');

dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.extend(isoWeek);

require('dotenv').config();
/* 
This sample slack application uses SocketMode
For the companion getting started setup guide, 
see: https://slack.dev/bolt-js/tutorial/getting-started 
*/

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleSecret = process.env.SUPABASE_SERVICE_ROLE_SECRET;
const supabase = createClient(supabaseUrl, serviceRoleSecret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const convertInstallation = (data) => {
  const installation = {
    team: {
      id: data?.team?.id,
      name: data?.team.name,
    },
    enterprise: data?.enterprise,
    user: {
      token: undefined,
      scopes: undefined,
      id: data?.user_id,
    },
    tokenType: data?.token_type,
    isEnterpriseInstall: data?.is_enterprise_install,
    appId: data?.app_id,
    authVersion: 'v2',
    bot: {
      scopes: [
        'channels:history',
        'chat:write',
        'commands',
        'groups:history',
        'im:history',
        'mpim:history',
        'app_mentions:read',
        'channels:join',
        'chat:write.customize',
        'users:read',
        'channels:manage',
      ],
      token: data?.access_token,
      userId: data?.bot_user_id,
      id: data?.team_id, // You may want to replace this with an appropriate value
    },
  };

  return installation;
};

const database = {
  async getTokenByTeam(teamId, userId) {
    const { data, error } = await supabase
      .from('tenants_users_accounts')
      .select('settings')
      .eq('settings->>user_id', userId)
      .eq('settings->>team_id', teamId)
      .single();

    return convertInstallation(data.settings);
  },
  async getTokenByEnterprise(enterpriseId, userId) {
    const { data, error } = await supabase
      .from('tenants_users_accounts')
      .select('settings')
      .eq('settings->>user_id', userId)
      .eq('settings->>enterprise_id', enterpriseId)
      .single();

    return convertInstallation(data.settings);
  },

  async deleteTokenByTeam(teamId) {
    const { data, error } = await supabase
      .from('tenants_users_accounts')
      .delete()
      .eq('settings->>user_id', userId)
      .eq('settings->>team_id', teamId);

    return null;
  },
  async deleteTokenByEnterprise(enterpriseId, userId) {
    const { data, error } = await supabase
      .from('tenants_users_accounts')
      .delete()
      .eq('settings->>user_id', userId)
      .eq('settings->>enterprise_id', enterpriseId);

    return null;
  },
};

async function getTenantUserId(userId) {
  try {
    const { data, error } = await supabase
      .from('tenants_users_accounts')
      .select('tenant_user_id')
      .eq('settings->>user_id', userId)
      .single();
    if (!error) {
      return data.tenant_user_id;
    }
  } catch (error) {
    // Handle any unexpected errors
    console.error(error);
    throw new Error('An unexpected error occurred');
  }
}

async function getTenantUserTimezone(tenantUserId) {
  try {
    const { data, error } = await supabase
      .from('tenants_users')
      .select('timezone')
      .eq('id', tenantUserId)
      .single();

    if (!error) {
      return data.timezone;
    }
  } catch (error) {
    // Handle any unexpected errors
    console.error(error);
    throw new Error('An unexpected error occurred');
  }
}

async function getTenantUserAutoMoving(tenantUserId) {
  try {
    const { data, error } = await supabase
      .from('tenants_users')
      .select('settings')
      .eq('id', tenantUserId)
      .single();

    if (!error) {
      return data.settings.autoMoving;
    }
  } catch (error) {
    // Handle any unexpected errors
    console.error(error);
    throw new Error('An unexpected error occurred');
  }
}

const emptyTodos = (day) => {
  return {
    response_type: 'ephemeral',
    block_id: 'get_empty_todos',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You don’t have any to-do for ${day}`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Open BeforeSunset AI',
            emoji: true,
          },
          value: 'go_to_todos_section',
          url: 'https://test.app.beforesunset.ai/en/todos',
          action_id: 'button-action',
        },
      },
    ],
  };
};

const socketModeReceiver = new SocketModeReceiver({
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: 'a-secret',
  scopes: [
    'channels:history',
    'chat:write',
    'commands',
    'groups:history',
    'im:history',
    'mpim:history',
    'app_mentions:read',
    'channels:join',
    'chat:write.customize',
    'users:read',
    'incoming-webhook',
  ],
  customRoutes: [
    {
      method: 'GET',
      handler: (_, res) => {
        res.end('Bolt app is running!');
      },
      path: '/',
    },
  ],
  installationStore: {
    fetchInstallation: async (installQuery) => {
      // Bolt will pass your handler an installQuery object
      // Change the lines below so they fetch from your database
      const userId = installQuery.userId;
      if (
        installQuery.isEnterpriseInstall &&
        installQuery.enterpriseId !== undefined
      ) {
        // handle org wide app installation lookup
        return await database.getTokenByEnterprise(
          installQuery.enterpriseId,
          userId,
        );
      }
      if (installQuery.teamId !== undefined) {
        // single team app installation lookup

        return await database.getTokenByTeam(installQuery.teamId, userId);
      }
      throw new Error('Failed fetching installation');
    },
    deleteInstallation: async (installQuery) => {
      // Bolt will pass your handler  an installQuery object
      // Change the lines below so they delete from your database
      const userId = installQuery.userId;
      if (
        installQuery.isEnterpriseInstall &&
        installQuery.enterpriseId !== undefined
      ) {
        // org wide app installation deletion
        return await database.deleteTokenByTeam(
          installQuery.enterpriseId,
          userId,
        );
      }
      if (installQuery.teamId !== undefined) {
        // single team app installation deletion
        return await database.deleteTokenByEnterprise(
          installQuery.teamId,
          userId,
        );
      }
      throw new Error('Failed to delete installation');
    },
  },
});

// Initializes your app with your bot token and app token
const app = new App({
  //   socketMode: true,
  //   appToken: process.env.SLACK_APP_TOKEN,
  //   signingSecret: process.env.SLACK_SIGNING_SECRET,
  //   clientId: process.env.SLACK_CLIENT_ID,
  //   clientSecret: process.env.SLACK_CLIENT_SECRET,

  //   stateSecret: 'a-secret',
  //   scopes: [
  //     'channels:history',
  //     'chat:write',
  //     'commands',
  //     'groups:history',
  //     'im:history',
  //     'mpim:history',
  //     'app_mentions:read',
  //     'channels:join',
  //     'chat:write.customize',
  //     'users:read',
  //     'incoming-webhook',
  //   ],
  //   installationStore: {
  //     fetchInstallation: async (installQuery) => {
  //       // Bolt will pass your handler an installQuery object
  //       // Change the lines below so they fetch from your database
  //       const userId = installQuery.userId;
  //       if (
  //         installQuery.isEnterpriseInstall &&
  //         installQuery.enterpriseId !== undefined
  //       ) {
  //         // handle org wide app installation lookup
  //         return await database.getTokenByEnterprise(
  //           installQuery.enterpriseId,
  //           userId,
  //         );
  //       }
  //       if (installQuery.teamId !== undefined) {
  //         // single team app installation lookup

  //         return await database.getTokenByTeam(installQuery.teamId, userId);
  //       }
  //       throw new Error('Failed fetching installation');
  //     },
  //     deleteInstallation: async (installQuery) => {
  //       // Bolt will pass your handler  an installQuery object
  //       // Change the lines below so they delete from your database
  //       const userId = installQuery.userId;
  //       if (
  //         installQuery.isEnterpriseInstall &&
  //         installQuery.enterpriseId !== undefined
  //       ) {
  //         // org wide app installation deletion
  //         return await database.deleteTokenByTeam(
  //           installQuery.enterpriseId,
  //           userId,
  //         );
  //       }
  //       if (installQuery.teamId !== undefined) {
  //         // single team app installation deletion
  //         return await database.deleteTokenByEnterprise(
  //           installQuery.teamId,
  //           userId,
  //         );
  //       }
  //       throw new Error('Failed to delete installation');
  //     },
  //   },
  receiver: socketModeReceiver,
  logLevel: LogLevel.DEBUG,
});

(async () => {
  // Start your app
  await app.start(process.env.SLACK_APP_PORT);

  console.log('⚡️ Bolt app is running!');
})();

// Listen for a slash command invocation

app.command('/bs', async ({ ack, context, respond, command, logger }) => {
  const tenantUserId = await getTenantUserId(context.userId);

  if (!tenantUserId) {
    return;
  }

  const newTask = {
    task_title: command.text,
    planned_at: null,
    tenant_user_id: tenantUserId,
    planned_at_attribute: 'LATER',
    task_order: 0,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(newTask)
    .select('id, task_title')
    .single();

  try {
    await ack();

    if (command.text) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'convert_todo',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-do was added to “Later”',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: data.task_title,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-do details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-do in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: `https://test.app.beforesunset.ai/en/focus/${data.id}`,
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(`☀️ ☀️ ☀️ **BeforeSunset AI** is AI-powered daily and weekly planner that plans your day based on your schedule and to-do list by time-blocking on your calendar.   You can use it via Slack, the **[web interface]** https://app.beforesunset.ai/en/login .
      Below are valid Slack commands for BeforesunsetAI:
        /bs task_title → Create to-do on the Later tab.
                
        /bsyesterday → List your to-dos from the day before.
                
        /bstoday → List your to-dos for today.
                
        /bstommorrow → List your to-dos for tomorrow.
                
        /bsrest → List your to-dos for rest of the week.
                
        /bslater → List your to-dos for later.`);
    }
  } catch (error) {
    logger.error(error);
  }
});

app.command('/bstoday', async ({ ack, context, respond, logger }) => {
  // Acknowledge the command request

  const tenantUserId = await getTenantUserId(context.userId);

  const timezone = await getTenantUserTimezone(tenantUserId);
  const autoMoving = await getTenantUserAutoMoving(tenantUserId);

  const date = dayjs().tz(timezone).startOf('day').toISOString();
  const nextDate = dayjs().tz(timezone).endOf('day').toISOString();

  if (!tenantUserId) {
    return;
  }

  const query = supabase
    .from('vw_tasks')
    .select('id, task_title, completed_at')
    .eq('tenant_user_id', tenantUserId)
    .eq('is_displayed_in_list', true)
    .order('id');

  const { data, error } =
    autoMoving === 'ON'
      ? await query.or(
          `and(planned_at.gte.${date},planned_at.lt.${nextDate}), and(planned_at.gte.${dayjs()
            .tz(timezone)
            .subtract(1, 'month')
            .toISOString()},planned_at.lt.${date},completed_at.is.NULL)`,
        )
      : await query
          .gte('planned_at::date', date)
          .lt('planned_at::date', nextDate);

  const todoList = data.map((item) => {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.completed_at ? '✓' : '☐'}  ${item.task_title}`,
      },
    };
  });

  try {
    await ack();

    if (todoList.length > 0) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'get_todos_today',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-dos for Today:',
            },
          },
          ...todoList,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-dos details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-dos in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: 'https://test.app.beforesunset.ai/en/todos',
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(emptyTodos('Today'));
    }
  } catch (error) {
    logger.error(error);
  }
});
app.command('/bstomorrow', async ({ ack, context, respond, logger }) => {
  // Acknowledge the command request

  const tenantUserId = await getTenantUserId(context.userId);
  const timezone = await getTenantUserTimezone(tenantUserId);

  const date = dayjs().tz(timezone).add(1, 'day').startOf('day').toISOString();
  const nextDate = dayjs()
    .tz(timezone)
    .add(1, 'day')
    .endOf('day')
    .toISOString();

  if (!tenantUserId) {
    return;
  }

  const { data, error } = await supabase
    .from('vw_tasks')
    .select('id, task_title, completed_at')
    .eq('tenant_user_id', tenantUserId)
    .eq('is_displayed_in_list', true)
    .gte('planned_at::date', date)
    .lt('planned_at::date', nextDate)
    .order('id');

  const todoList = data.map((item) => {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.completed_at ? '✓' : '☐'}  ${item.task_title}`,
      },
    };
  });

  try {
    await ack();
    if (todoList) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'get_todos_tomorrow',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-dos for Tomorrow:',
            },
          },
          ...todoList,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-dos details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-dos in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: 'https://test.app.beforesunset.ai/en/todos',
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(emptyTodos('Tomorrow'));
    }
  } catch (error) {
    logger.error(error);
  }
});

app.command('/bsyesterday', async ({ ack, context, respond, logger }) => {
  // Acknowledge the command request

  const tenantUserId = await getTenantUserId(context.userId);
  const timezone = await getTenantUserTimezone(tenantUserId);

  const date = dayjs()
    .tz(timezone)
    .subtract(1, 'day')
    .startOf('day')
    .toISOString();
  const nextDate = dayjs()
    .tz(timezone)
    .subtract(1, 'day')
    .endOf('day')
    .toISOString();

  if (!tenantUserId) {
    return;
  }

  const { data, error } = await supabase
    .from('vw_tasks')
    .select('id, task_title, completed_at')
    .eq('tenant_user_id', tenantUserId)
    .eq('is_displayed_in_list', true)
    .gte('planned_at::date', date)
    .lt('planned_at::date', nextDate)
    .order('id');

  const todoList = data.map((item) => {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.completed_at ? '✓' : '☐'}  ${item.task_title}`,
      },
    };
  });

  try {
    await ack();

    if (todoList) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'get_todos_yesterday',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-dos for Yesterday:',
            },
          },
          ...todoList,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-dos details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-dos in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: 'https://test.app.beforesunset.ai/en/todos',
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(emptyTodos('Yesterday'));
    }
  } catch (error) {
    logger.error(error);
  }
});

app.command('/bslater', async ({ ack, context, respond, logger }) => {
  // Acknowledge the command request

  const tenantUserId = await getTenantUserId(context.userId);
  const timezone = await getTenantUserTimezone(tenantUserId);

  if (!tenantUserId) {
    return;
  }

  const { data, error } = await supabase
    .from('vw_tasks')
    .select('id, task_title, completed_at')
    .eq('tenant_user_id', tenantUserId)
    .eq('is_displayed_in_list', true)
    .or(
      `and(planned_at_attribute.eq.LATER, planned_at.is.NULL), planned_at.gte.${dayjs()
        .tz(timezone)
        .endOf('day')
        .endOf('isoWeek')
        .toISOString()}`,
    )
    .order('id');

  const todoList = data.map((item) => {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.completed_at ? '✓' : '☐'}  ${item.task_title}`,
      },
    };
  });

  try {
    await ack();

    if (todoList) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'get_todos_later',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-dos for Later:',
            },
          },
          ...todoList,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-dos details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-dos in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: 'https://test.app.beforesunset.ai/en/todos',
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(emptyTodos('Later'));
    }
  } catch (error) {
    logger.error(error);
  }
});

app.command('/bsrest', async ({ ack, context, respond, logger }) => {
  // Acknowledge the command request

  const tenantUserId = await getTenantUserId(context.userId);
  const timezone = await getTenantUserTimezone(tenantUserId);

  if (!tenantUserId) {
    return;
  }

  const { data, error } = await supabase
    .from('vw_tasks')
    .select('id, task_title, completed_at')
    .eq('tenant_user_id', tenantUserId)
    .eq('is_displayed_in_list', true)
    .or(
      `and(planned_at_attribute.eq.REST_OF_THE_WEEK,planned_at.is.NULL), and( planned_at.gte.${dayjs()
        .tz(timezone)
        .endOf('day')
        .add(1, 'day')
        .toISOString()},planned_at.lt.${dayjs()
        .tz(timezone)
        .endOf('day')
        .endOf('isoWeek')
        .toISOString()})`,
    )
    .order('id');

  const todoList = data.map((item) => {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${item.completed_at ? '✓' : '☐'}  ${item.task_title}`,
      },
    };
  });

  try {
    await ack();

    if (todoList) {
      await respond({
        response_type: 'ephemeral',
        block_id: 'get_todos_later',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your to-dos for Rest:',
            },
          },
          ...todoList,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'See your to-dos details',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Open to-dos in BeforeSunset AI',
                emoji: true,
              },
              value: 'go_to_todos_section',
              url: 'https://app.beforesunset.ai/en/todos',
              action_id: 'button-action',
            },
          },
        ],
      });
    } else {
      await respond(emptyTodos('Rest of the Week'));
    }
  } catch (error) {
    logger.error(error);
  }
});

app.shortcut('convert_todo', async ({ shortcut, ack, context, respond }) => {
  const tenantUserId = await getTenantUserId(context.userId);

  if (!tenantUserId) {
    return;
  }

  const newTask = {
    task_title: shortcut.message.text,
    planned_at: null,
    tenant_user_id: tenantUserId,
    planned_at_attribute: 'LATER',
    task_order: 0,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(newTask)
    .select('id, task_title')
    .single();

  try {
    await ack();

    await respond({
      response_type: 'ephemeral',
      block_id: 'convert_todo',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Your todo is added to Later:',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: data.task_title,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Go to todo details',
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Open Todo in BeforeSunset',
              emoji: true,
            },
            value: 'go_to_todos_section',
            url: `https://test.app.beforesunset.ai/en/focus/${data.id}`,
            action_id: 'button-action',
          },
        },
      ],
    });
  } catch (error) {}
});
