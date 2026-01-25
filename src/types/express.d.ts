import { Organization, User, Membership } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      organization?: Organization | null;
      user?: User;
      membership?: Membership;
      currentOrganizationId?: string;
    }
  }
}
