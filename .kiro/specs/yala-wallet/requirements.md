# Requirements Document

## Introduction

Yala Wallet is a standalone Django app that provides an in-app digital wallet for riders and drivers on the Yala platform. Riders can top up their wallet via existing payment methods (Bankily, Masrvi, Seddad, Card) and use the wallet balance to pay for rides. Drivers receive earnings automatically credited to their wallet after ride completion (fare minus 30% app fee, plus tips). The wallet operates in MRU currency and coexists alongside other payment methods as an optional choice for riders.

## Glossary

- **Wallet_App**: The standalone Django application managing wallet balances and transactions
- **Wallet**: A digital balance record associated with a single user (rider or driver)
- **Top_Up**: A self-service operation where a rider adds funds to the Wallet from an external payment method
- **Wallet_Transaction**: A ledger entry recording any credit or debit against a Wallet
- **Rider**: An authenticated user with user_type "rider"
- **Driver**: An authenticated user with user_type "driver"
- **App_Fee**: The 30% commission deducted from the ride fare before crediting the driver
- **Fare**: The total price of a completed ride (estimated_price from the Ride model)
- **Tip**: An optional gratuity amount added by the rider for the driver
- **Payment_Method**: An external funding source (Bankily, Masrvi, Seddad, or Card) used for top-ups
- **MRU**: Mauritanian Ouguiya, the sole currency used in the system

## Requirements

### Requirement 1: Wallet Creation

**User Story:** As a user (rider or driver), I want a wallet automatically provisioned for my account, so that I can store and use funds within the app.

#### Acceptance Criteria

1. WHEN a Rider or Driver account is created, THE Wallet_App SHALL create a Wallet with a zero balance in MRU for that user.
2. THE Wallet_App SHALL associate exactly one Wallet per user account.
3. IF a Wallet already exists for a user, THEN THE Wallet_App SHALL return the existing Wallet instead of creating a duplicate.

### Requirement 2: Wallet Balance Retrieval

**User Story:** As a user, I want to view my current wallet balance, so that I know how much money is available.

#### Acceptance Criteria

1. WHEN an authenticated user requests the wallet balance, THE Wallet_App SHALL return the current balance amount in MRU.
2. THE Wallet_App SHALL expose the balance via a REST API endpoint requiring JWT authentication.

### Requirement 3: Rider Wallet Top-Up

**User Story:** As a rider, I want to add funds to my wallet using my existing payment methods, so that I can pay for rides with my wallet balance.

#### Acceptance Criteria

1. WHEN a Rider submits a top-up request with a valid amount and Payment_Method, THE Wallet_App SHALL initiate a charge against the selected Payment_Method.
2. WHEN the external payment charge succeeds, THE Wallet_App SHALL credit the Rider Wallet with the top-up amount.
3. WHEN the external payment charge succeeds, THE Wallet_App SHALL create a Wallet_Transaction of type "top_up" recording the credited amount, Payment_Method used, and timestamp.
4. IF the external payment charge fails, THEN THE Wallet_App SHALL retain the original Wallet balance unchanged.
5. IF the external payment charge fails, THEN THE Wallet_App SHALL create a Wallet_Transaction of type "top_up" with status "failed" and include the failure reason.
6. THE Wallet_App SHALL reject top-up requests with an amount less than or equal to zero.
7. THE Wallet_App SHALL support Bankily, Masrvi, Seddad, and Card as valid top-up Payment_Methods.

### Requirement 4: Ride Payment via Wallet

**User Story:** As a rider, I want to pay for a ride using my wallet balance, so that I have a convenient cashless option without using external payment methods each time.

#### Acceptance Criteria

1. WHEN a Rider selects the Wallet as the payment method for a ride, THE Wallet_App SHALL verify the Wallet balance is greater than or equal to the Fare amount.
2. WHEN a ride is completed and the Rider selected the Wallet as payment method, THE Wallet_App SHALL debit the Fare amount from the Rider Wallet.
3. WHEN a Wallet debit is performed for a ride, THE Wallet_App SHALL create a Wallet_Transaction of type "ride_payment" linking the ride identifier, amount debited, and timestamp.
4. IF the Rider Wallet balance is less than the Fare amount at the time of payment, THEN THE Wallet_App SHALL reject the wallet payment and notify the Rider of insufficient funds.
5. WHILE the Rider has a Wallet with sufficient balance, THE Wallet_App SHALL display the Wallet as an available payment option alongside other Payment_Methods.

### Requirement 5: Driver Earnings Auto-Credit

**User Story:** As a driver, I want my earnings automatically credited to my wallet after completing a ride, so that I receive payment without manual action.

#### Acceptance Criteria

1. WHEN a ride is completed, THE Wallet_App SHALL calculate the driver earning as: Fare minus App_Fee (30% of Fare) plus Tip amount.
2. WHEN a ride is completed, THE Wallet_App SHALL credit the calculated driver earning to the Driver Wallet.
3. WHEN driver earnings are credited, THE Wallet_App SHALL create a Wallet_Transaction of type "ride_earning" recording the ride identifier, gross fare, app fee deducted, tip amount, and net earning credited.
4. THE Wallet_App SHALL process driver earning credits asynchronously via a Celery task.
5. IF the earning credit Celery task fails, THEN THE Wallet_App SHALL retry the task up to 3 times with exponential backoff.

### Requirement 6: Wallet Transaction History

**User Story:** As a user, I want to view my transaction history, so that I can track all wallet activity including top-ups, payments, and earnings.

#### Acceptance Criteria

1. WHEN an authenticated user requests transaction history, THE Wallet_App SHALL return a paginated list of Wallet_Transactions ordered by most recent first.
2. THE Wallet_App SHALL include for each Wallet_Transaction: the type, amount, status, timestamp, and associated reference (ride ID or payment method).
3. WHERE a filter parameter is provided, THE Wallet_App SHALL filter transactions by type (top_up, ride_payment, ride_earning, withdrawal).

### Requirement 7: Driver Wallet Withdrawal

**User Story:** As a driver, I want to withdraw funds from my wallet to my payout method, so that I can access my earnings externally.

#### Acceptance Criteria

1. WHEN a Driver submits a withdrawal request with a valid amount and a registered DriverPayoutMethod, THE Wallet_App SHALL create a withdrawal record with status "pending".
2. THE Wallet_App SHALL verify the Driver Wallet balance is greater than or equal to the withdrawal amount before accepting the request.
3. WHEN a withdrawal request is created, THE Wallet_App SHALL debit the withdrawal amount from the Driver Wallet immediately.
4. WHEN a withdrawal request is created, THE Wallet_App SHALL create a Wallet_Transaction of type "withdrawal" recording the amount, payout method, and status.
5. IF the Driver Wallet balance is less than the requested withdrawal amount, THEN THE Wallet_App SHALL reject the withdrawal request with an insufficient funds error.
6. IF a withdrawal is rejected by an administrator, THEN THE Wallet_App SHALL refund the withdrawal amount back to the Driver Wallet and update the Wallet_Transaction status to "refunded".

### Requirement 8: Wallet Data Integrity

**User Story:** As the platform operator, I want wallet operations to be atomic, so that no funds are lost or duplicated due to concurrent access or system failures.

#### Acceptance Criteria

1. THE Wallet_App SHALL use database-level row locking (select_for_update) when modifying the Wallet balance.
2. THE Wallet_App SHALL wrap each balance modification and its corresponding Wallet_Transaction creation in a single database transaction.
3. IF a database transaction fails during a wallet operation, THEN THE Wallet_App SHALL roll back all changes and return an error to the caller.
4. THE Wallet_App SHALL enforce a non-negative balance constraint at the database level (balance >= 0).

### Requirement 9: Wallet Admin Visibility

**User Story:** As an administrator, I want to view and manage wallet data through Django Admin, so that I can monitor balances and resolve disputes.

#### Acceptance Criteria

1. THE Wallet_App SHALL register Wallet and Wallet_Transaction models in the Django Admin interface.
2. THE Wallet_App SHALL allow administrators to search wallets by user email and filter transactions by type and status.
3. THE Wallet_App SHALL display the current balance, user, and creation date on the Wallet admin list view.
