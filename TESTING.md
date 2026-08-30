# DriverHub 360 Testing Guide

## User Roles

DriverHub 360 supports 10 user roles with invitation-based access control:

**Self-Selectable Roles** (no invitation required):
- **driver**: Access to personal profile, pay data, trip history, documents
- **employee**: Standard employee access with basic permissions

**Admin-Assigned Roles** (require invitation from super_user or admin):
- **super_user**: Full system access, can manage users and invitations
- **admin**: Administrative access, can manage users and invitations
- **regional_cl**: Regional coordinator with area-specific management
- **network_cl**: Network coordinator managing multiple locations
- **dealer_cl**: Dealer coordinator with partner management access
- **certification_liaison**: Manages driver certifications and compliance
- **custom_user_list**: Custom role with specific permissions
- **testing**: Testing and development access

## User Invitation System Testing

### Creating the First Admin User

Since only Super Users and Admins can create invitations, you need to bootstrap the first admin via SQL:

```sql
-- Connect to your database and run:
UPDATE users 
SET role = 'super_user', role_selected_at = NOW() 
WHERE email = 'your-email@example.com';
```

Replace `your-email@example.com` with your Replit account email.

### Testing Invitation Workflow

#### 1. Create an Invitation (as Admin)

1. Log in as a user with `super_user` or `admin` role
2. Navigate to **User Management** page (`/users`) via the sidebar
3. Fill in the invitation form:
   - Email: Enter the target user's email
   - Role: Select any role (including admin roles)
4. Click **Create Invitation**
5. Copy the invitation link using the copy button

#### 2. Use an Invitation

1. Log out or use an incognito window
2. Click the invitation link (format: `?invite=CODE`)
3. Log in with Replit Auth
4. You should see:
   - "Validating invitation..." loading state
   - Automatic role assignment
   - Redirect to the appropriate dashboard

#### 3. Verify Invitation Status

1. As an admin, go back to **User Management**
2. Check the invitation moved from "Pending" to "Used"
3. Verify the new user appears in the "All Users" table with correct role

### Testing Self-Service Registration

#### Driver/Employee Registration (No Invitation)

1. Log in without an invitation link
2. On the role selection page, you should see:
   - **Available Roles**: Driver and Employee (clickable cards)
   - **Restricted Roles**: All other roles (grayed out, non-clickable)
3. Select Driver or Employee
4. Verify role is assigned correctly

#### Attempting Restricted Role (Should Fail)

1. If you try to click a restricted role without an invitation:
   - Toast notification: "This role must be assigned by an administrator"
   - No role change occurs

### Testing Role-Based Access

#### Super User / Admin Access

- ✅ Can access **User Management** page
- ✅ Can create invitations for any role
- ✅ Can view all users and invitations
- ✅ Can delete pending invitations
- ✅ Can access corporate dashboard and all driver data

#### Driver Access

- ✅ Can access: Home, Profile, Pay Data, Trip History, Documents
- ❌ Cannot access: Corporate Dashboard, User Management
- ✅ Can only view own data

#### Employee Access

- ✅ Can access basic employee features
- ❌ Cannot access driver-specific data
- ❌ Cannot access admin features

### Testing Edge Cases

#### Expired Invitation (Code Path)

1. Create an invitation via User Management page
2. Copy the invitation link
3. Manually update expiration in database:
   ```sql
   UPDATE user_invitations 
   SET expires_at = NOW() - INTERVAL '1 day' 
   WHERE invite_code = 'YOUR_CODE';
   ```
4. Try to use the invitation link
5. Should see: "This invitation has expired" (400 error)

#### Expired Invitation (Email Path - Regression Test)

1. Create an invitation for a specific email
2. Expire the invitation in database (same SQL as above)
3. Log in with that email WITHOUT using the invitation code parameter
4. Attempt to select a role
5. Should see: "This invitation has expired" (400 error)
6. **Purpose**: Verify expiration is checked regardless of invitation discovery method

#### Already-Used Invitation (Code Path)

1. Create and use an invitation successfully
2. Try to use the same invitation code again
3. Should see: "This invitation has already been used" (400 error)

#### Already-Used Invitation (Email Path - Regression Test)

1. Create an invitation and mark it as used in database:
   ```sql
   UPDATE user_invitations 
   SET used_at = NOW(), used_by = 'some-user-id' 
   WHERE email = 'test@example.com';
   ```
2. Log in with that email without invitation code
3. Should see: "This invitation has already been used" (400 error)
4. **Purpose**: Verify usage validation applies to email-based discovery

#### Duplicate Email Invitation

1. Create an invitation for `user@example.com`
2. Try to create another invitation for the same email
3. Should see: "An active invitation already exists for this email"

#### Invalid Invitation Code

1. Navigate to `?invite=INVALID_CODE`
2. Should see: "Invitation not found" error

#### Email Mismatch (Security Test)

1. Create an invitation for `user-a@example.com`
2. Log in as `user-b@example.com`
3. Try to use the invitation code created for user-a
4. Should see: "This invitation is for a different email address" (403 error)
5. **Purpose**: Verify invitations cannot be hijacked by different users

### Database Schema Testing

Verify the `userInvitations` table structure:

```sql
SELECT * FROM user_invitations;
```

Expected columns:
- `id`: Primary key (varchar UUID)
- `email`: Target user email (unique)
- `role`: Assigned role (varchar)
- `invited_by`: Admin user ID (foreign key to users)
- `invite_code`: Unique code for the link
- `expires_at`: Expiration timestamp
- `used_at`: When invitation was used (null if pending)
- `used_by`: User ID who used it (null if pending)
- `created_at`: Creation timestamp

### API Endpoint Testing

#### Get All Users (Admin Only)

```bash
GET /api/admin/users
Authorization: Replit Auth session

Expected: 200 OK with user array
```

#### Create Invitation (Admin Only)

```bash
POST /api/admin/invitations
Authorization: Replit Auth session
Content-Type: application/json

{
  "email": "newuser@example.com",
  "role": "admin"
}

Expected: 200 OK with invitation object
```

#### Validate Invitation (Public)

```bash
GET /api/invitations/:code

Expected: 200 OK with { email, role }
or 404/400 for invalid/expired invitations
```

#### Set Role with Invitation

```bash
POST /api/admin/set-role
Authorization: Replit Auth session
Content-Type: application/json

{
  "role": "admin",
  "inviteCode": "abc123xyz"
}

Expected: 200 OK with updated user
```

### Common Issues & Solutions

**Issue**: Can't access User Management page
- **Solution**: Ensure your user has `super_user` or `admin` role via SQL

**Issue**: Invitation link doesn't work
- **Solution**: Check that the invite code is correctly passed as `?invite=CODE`

**Issue**: Role not updating
- **Solution**: Check browser console for errors and verify backend logs

**Issue**: Can't log in after role selection
- **Solution**: Clear browser cache and try again

### Testing Checklist

- [ ] First admin can be created via SQL
- [ ] Admin can access User Management page
- [ ] Admin can create invitations for all roles
- [ ] Invitation links work correctly
- [ ] Invited users get correct role automatically
- [ ] Non-invited users can only select Driver/Employee
- [ ] Expired invitations are rejected
- [ ] Used invitations cannot be reused
- [ ] Duplicate email invitations are prevented
- [ ] Admin sidebar section only visible to super_user/admin
- [ ] All users table displays correctly
- [ ] Pending/used invitations display correctly
- [ ] Copy invitation link button works
- [ ] Delete invitation button works

## Testing Driver Features

1. Log in as a driver user
2. Navigate to:
   - `/` - Driver home dashboard
   - `/profile` - Update driver profile
   - `/pay` - View pay data
   - `/trips` - View trip history
   - `/documents` - Upload and manage documents

## Testing Corporate Features

1. Log in as a user with corporate access (any role except driver/employee)
2. Navigate to:
   - `/` - Corporate dashboard
   - `/drivers` - Driver directory
   - `/drivers/:id` - Driver detail page with notes

## Sample Data

Currently, the application starts with no sample data. To add test data:

### Creating Test Drivers via SQL

```sql
-- Insert test driver data
INSERT INTO drivers (user_id, first_name, last_name, phone, email, address, city, state, zip, hire_date, status)
VALUES 
  ('user-id-1', 'John', 'Doe', '555-0101', 'john.doe@example.com', '123 Main St', 'Springfield', 'IL', '62701', '2024-01-15', 'active'),
  ('user-id-2', 'Jane', 'Smith', '555-0102', 'jane.smith@example.com', '456 Oak Ave', 'Chicago', 'IL', '60601', '2024-02-20', 'active');
```

### Creating Test Pay Records

```sql
-- Insert test pay records
INSERT INTO pay_records (driver_id, pay_period_start, pay_period_end, gross_pay, net_pay, hours_worked, miles_delivered, bonuses)
VALUES 
  ('driver-id-1', '2024-01-01', '2024-01-15', '1200.00', '980.00', '80', '450', '100.00');
```

### Creating Test Trips

```sql
-- Insert test trips
INSERT INTO trips (driver_id, trip_date, route, stops, revenue)
VALUES 
  ('driver-id-1', '2024-01-10', 'Downtown Route', 12, '150.00');
```
