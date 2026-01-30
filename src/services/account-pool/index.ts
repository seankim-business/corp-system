export { ClaudeAccount, AccountPoolService, AccountSelectionCriteria } from "./account-pool.service";
export { EncryptionService } from "./encryption.service";

import { AccountPoolService } from "./account-pool.service";

let _instance: AccountPoolService | null = null;

export function createAccountPoolService(): AccountPoolService {
  if (!_instance) {
    _instance = new AccountPoolService();
  }
  return _instance;
}
