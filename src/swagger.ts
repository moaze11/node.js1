import swaggerJsdoc from 'swagger-jsdoc';

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

export const swaggerSpec = swaggerJsdoc(options);

export const swaggerEndpoints = {
  '/auth/super-admin': {
    post: {
      summary: 'Create Super Admin (one-time)',
      tags: ['Auth'],
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
        400: { description: 'Invalid input' }
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
  '/email/invite': {
    post: {
      summary: 'Send invitation (SuperAdmin only)',
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
  '/email/accept-invitation': {
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
  '/email/forgot-password': {
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
  '/email/reset-password': {
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
