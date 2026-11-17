export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    email: string;
    role: string;
  };
}

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
  /** Session (ligne RefreshToken) à laquelle l'access token est rattaché : VULN-002 */
  sid: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
}
