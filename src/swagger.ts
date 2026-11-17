
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auth API',
      version: '1.0.0',
      description: 'Complete authentication system with RBAC',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            email: { type: 'string' },
            password: { type: 'string' },
            role: { type: 'string' },
            isActive: { type: 'boolean' },
            emailVerified: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Token: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            statusCode: { type: 'number' }
          }
        }
      }
    }
  },
  apis: []
};


const swaggerEndpoints: Record<string, any> = {
  '/auth/super-admin': {
    post: {
      summary: 'Create Super Admin (one-time)',
      description: 'Closed unless SUPERADMIN_BOOTSTRAP_TOKEN (32+ chars) is set on the server and sent in X-Bootstrap-Token.',
      tags: ['Auth'],
      parameters: [
        { name: 'X-Bootstrap-Token', in: 'header', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                password: { type: 'string', minLength: 8 }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Super Admin created' },
        400: { description: 'Invalid input or SuperAdmin already exists' },
        403: { description: 'Bootstrap disabled or wrong token' },
        409: { description: 'Bootstrap already in progress' }
      }
    }
  },
  '/auth/login': {
    post: {
      summary: 'User login',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                password: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Login successful', schema: { $ref: '#/components/schemas/Token' } },
        401: { description: 'Invalid credentials' }
      }
    }
  },
  '/auth/refresh': {
    post: {
      summary: 'Refresh access token',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Token refreshed' },
        401: { description: 'Invalid token' }
      }
    }
  },
  '/auth/logout': {
    post: {
      summary: 'User logout',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Logged out successfully' }
      }
    }
  },
  '/user/profile': {
    get: {
      summary: 'Get my profile',
      tags: ['User'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'User profile' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/user/roles': {
    get: {
      summary: 'Get available roles',
      tags: ['User'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of roles' }
      }
    }
  },
  '/auth/invite': {
    post: {
      summary: 'Send invitation (Admin or SuperAdmin)',
      tags: ['Email'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Invitation sent' },
        403: { description: 'Forbidden' }
      }
    }
  },
  '/auth/accept-invitation': {
    post: {
      summary: 'Accept invitation and set password',
      tags: ['Email'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                password: { type: 'string', minLength: 8 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Invitation accepted' },
        400: { description: 'Invalid or expired token' }
      }
    }
  },
  '/auth/forgot-password': {
    post: {
      summary: 'Request password reset',
      tags: ['Email'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Reset email sent' }
      }
    }
  },
  '/auth/reset-password': {
    post: {
      summary: 'Reset password with token',
      tags: ['Email'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                password: { type: 'string', minLength: 8 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password reset successfully' },
        400: { description: 'Invalid or expired token' }
      }
    }
  },
  '/admin/users': {
    post: {
      summary: 'Create user (SuperAdmin only)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                password: { type: 'string', minLength: 8 },
                roleId: { type: 'number' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'User created' },
        403: { description: 'Forbidden' }
      }
    },
    get: {
      summary: 'List all users (Admin+ only)',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of users' },
        403: { description: 'Forbidden' }
      }
    }
  }
};

const bearer = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const validationError = { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

const ticketSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    ownerId: { type: 'integer' },
    assigneeId: { type: 'integer', nullable: true },
    category: { type: 'string', nullable: true, enum: ['technical', 'simple_question', 'off_topic'], description: 'Set by the AI triage' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const messageSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    ticketId: { type: 'integer' },
    authorId: { type: 'integer', nullable: true, description: 'null when the author is the AI' },
    authorType: { type: 'string', enum: ['user', 'agent', 'ai'] },
    content: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

const paginationSchema = {
  type: 'object',
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' }
  }
};

const listTicketsOp = {
  summary: 'List tickets (paginated, filtered, sorted)',
  description:
    'Access rules: SuperAdmin/Admin see all tickets; Agent sees tickets assigned to them and unassigned ones; User sees only their own tickets.',
  tags: ['Tickets'],
  security: bearer,
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'in_progress', 'closed'] } },
    { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
    { name: 'assigneeId', in: 'query', schema: { type: 'integer', minimum: 1 } },
    { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 }, description: 'Search in title and description' },
    { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'updatedAt', 'title', 'status', 'priority'], default: 'createdAt' } },
    { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } }
  ],
  responses: {
    200: {
      description: 'Paginated tickets',
      content: {
        'application/json': {
          schema: { type: 'object', properties: { data: { type: 'array', items: ticketSchema }, pagination: paginationSchema } }
        }
      }
    },
    400: validationError,
    401: { description: 'Unauthorized' }
  }
};

const extraEndpoints: Record<string, any> = {
  '/health': {
    get: { summary: 'Health check', tags: ['System'], responses: { 200: { description: 'OK' } } }
  },
  '/admin/users/{id}/role': {
    patch: {
      summary: 'Change a user role (SuperAdmin only, audited)',
      tags: ['Admin'],
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['roleId'], properties: { roleId: { type: 'integer', minimum: 1 } } } } }
      },
      responses: { 200: { description: 'Role assigned' }, 400: validationError, 403: { description: 'Forbidden' }, 404: { description: 'User not found' } }
    }
  },
  '/admin/users/{id}/status': {
    patch: {
      summary: 'Disable / reactivate a user (SuperAdmin only, audited; disabling revokes refresh tokens)',
      tags: ['Admin'],
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['isActive'], properties: { isActive: { type: 'boolean' } } } } }
      },
      responses: { 200: { description: 'Status updated' }, 400: validationError, 403: { description: 'Forbidden' }, 404: { description: 'User not found' } }
    }
  },
  '/admin/audit-logs': {
    get: {
      summary: 'List audit logs (SuperAdmin only)',
      tags: ['Admin'],
      security: bearer,
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'action', in: 'query', schema: { type: 'string', example: 'ROLE_ASSIGNED' } }
      ],
      responses: { 200: { description: 'Paginated audit logs' }, 403: { description: 'Forbidden' } }
    }
  },
  '/tickets': {
    get: listTicketsOp,
    post: {
      summary: 'Create a ticket (any authenticated user)',
      tags: ['Tickets'],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', minLength: 3, maxLength: 200 },
                description: { type: 'string', maxLength: 5000 },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description:
            'Ticket created, then triaged by the AI: technical → stays "open" for an agent; simple question (platform FAQ) → AI answers and "closed"; off-topic → "closed". The AI also sets the priority and posts its reply in the ticket thread (aiReply). If the AI is unavailable, the ticket is created without aiReply.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: ticketSchema,
                  aiReply: { ...messageSchema, nullable: true }
                }
              }
            }
          }
        },
        400: validationError,
        401: { description: 'Unauthorized' },
        429: { description: 'Too many tickets created (10 per hour per user)' }
      }
    }
  },
  '/tickets/{id}': {
    get: {
      summary: 'Get a ticket (404 if not visible to the caller)',
      tags: ['Tickets'],
      security: bearer,
      parameters: [idParam],
      responses: { 200: { description: 'Ticket' }, 404: { description: 'Not found' } }
    },
    patch: {
      summary: 'Update status / priority / assignee (Agent+; agents can only assign to themselves)',
      tags: ['Tickets'],
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                assigneeId: { type: 'integer', nullable: true }
              }
            }
          }
        }
      },
      responses: { 200: { description: 'Ticket updated' }, 400: validationError, 403: { description: 'Forbidden' }, 404: { description: 'Not found' } }
    }
  },
  '/tickets/{id}/messages': {
    get: {
      summary: 'Ticket thread (AI, user and agent messages); same access rules as the ticket',
      tags: ['Tickets'],
      security: bearer,
      parameters: [idParam],
      responses: {
        200: { description: 'Messages', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: messageSchema } } } } } },
        404: { description: 'Not found' }
      }
    },
    post: {
      summary: 'Reply in the thread (ticket owner or staff allowed to update it). The owner replying on a closed ticket reopens it.',
      tags: ['Tickets'],
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 5000 } } } } }
      },
      responses: { 201: { description: 'Message added' }, 400: validationError, 403: { description: 'Forbidden' }, 404: { description: 'Not found' } }
    }
  },
  '/agent/tickets': { get: { ...listTicketsOp, summary: 'List tickets (Agent+ alias of GET /tickets)' } }
};

export const swaggerSpec = {
  ...options.definition,
  paths: { ...swaggerEndpoints, ...extraEndpoints }
};
