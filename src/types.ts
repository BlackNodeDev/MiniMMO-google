/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ProjectId {
  id: string;
}

export interface Project {
  id: string;
  title: string;
  japaneseTitle?: string; // e.g. "無限" for an elegant touch
  description: string;
  longDescription: string;
  coverImage: string;
  tags: string[];
  projectUrl?: string;
  githubUrl?: string;
  order: number;
}

export interface Favorite {
  userId: string;
  projectId: string;
  favoritedAt: Date;
}

export type ThemeType = 'light' | 'dark' | 'sepia' | 'wabi-sabi';

export interface UserSetting {
  userId: string;
  themePreference: ThemeType;
  soundEnabled: boolean;
  interactiveBgComplexity: 'low' | 'regular' | 'high';
  updatedAt: Date;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
