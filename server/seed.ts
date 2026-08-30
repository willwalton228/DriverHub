// Seed script to add sample data for testing
import { db } from "./db";
import { users, drivers, employees, customers, trips } from "@shared/schema";
import { sql } from "drizzle-orm";

const firstNames = ["James", "Maria", "Robert", "Patricia", "Michael", "Jennifer", "William", "Linda", "David", "Elizabeth", "Carlos", "Sofia", "Marcus", "Angela", "Kevin"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson"];
const cities = ["Miami", "Fort Lauderdale", "Dallas", "Houston", "Tulsa", "Raleigh"];
const states = ["FL", "FL", "TX", "TX", "OK", "NC"];
const markets = ["Miami", "Fort Lauderdale", "Dallas/Ft Worth", "Houston", "Tulsa", "Raleigh"];
const customerTypes = ["DriverShift", "DriverDash", "Hybrid"];
const moveTypes = ["DriverShift", "DriverDash"];
const vehicleTypes = ["Sedan", "SUV", "Van", "Truck", "Pickup"];
const tripStatuses = ["completed", "completed", "completed", "completed", "cancelled", "in-progress"];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generatePhone(): string {
  return `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function generateAddress(): string {
  const num = Math.floor(Math.random() * 9999) + 1;
  const streets = ["Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Pine Rd", "Elm St", "Park Ave", "Lake Dr"];
  return `${num} ${randomElement(streets)}`;
}

async function seed() {
  console.log("Seeding database with test data...");

  try {
    // Create 10 test users for employees
    console.log("Creating users for employees...");
    const employeeUserIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      const email = `employee${i + 1}@test.com`;
      
      const [user] = await db.insert(users).values({
        email,
        firstName,
        lastName,
        role: "Employee",
        profileImageUrl: null,
      }).onConflictDoNothing().returning();
      
      if (user) {
        employeeUserIds.push(user.id);
      }
    }
    console.log(`Created ${employeeUserIds.length} employee users`);

    // Create 10 test users for drivers
    console.log("Creating users for drivers...");
    const driverUserIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      const email = `driver${i + 1}@test.com`;
      
      const [user] = await db.insert(users).values({
        email,
        firstName,
        lastName,
        role: "Driver",
        profileImageUrl: null,
      }).onConflictDoNothing().returning();
      
      if (user) {
        driverUserIds.push(user.id);
      }
    }
    console.log(`Created ${driverUserIds.length} driver users`);

    // Create 10 Employees
    console.log("Creating employees...");
    const createdEmployees = [];
    for (let i = 0; i < employeeUserIds.length; i++) {
      const cityIndex = i % cities.length;
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      
      const [employee] = await db.insert(employees).values({
        userId: employeeUserIds[i],
        firstName,
        lastName,
        email: `employee${i + 1}@test.com`,
        phoneNumber: generatePhone(),
        address: generateAddress(),
        city: cities[cityIndex],
        state: states[cityIndex],
        zipCode: `${30000 + Math.floor(Math.random() * 50000)}`,
        dateOfBirth: formatDateString(randomDate(new Date(1970, 0, 1), new Date(2000, 0, 1))),
        employeeId: `EMP${String(i + 1).padStart(4, '0')}`,
        title: randomElement(["Operations Coordinator", "Dispatch Manager", "Fleet Supervisor", "HR Specialist", "Account Manager"]),
        employeeType: randomElement(["Exempt", "Non-Exempt"]),
        employmentType: randomElement(["Full Time", "Part Time"]),
        hireDate: formatDateString(randomDate(new Date(2020, 0, 1), new Date(2024, 0, 1))),
        status: "active",
      }).returning();
      
      if (employee) {
        createdEmployees.push(employee);
      }
    }
    console.log(`Created ${createdEmployees.length} employees`);

    // Create 10 Customers
    console.log("Creating customers...");
    const createdCustomers = [];
    const customerNames = [
      "AutoNation Miami", "Sunrise Auto Group", "DFW Motors", "Houston Fleet Services",
      "Tulsa Transport Co", "Carolina Auto Sales", "Premier Dealership Group", 
      "Metro Car Exchange", "Sunbelt Auto Logistics", "Southeast Vehicle Partners"
    ];
    
    for (let i = 0; i < 10; i++) {
      const cityIndex = i % cities.length;
      const customerType = randomElement(customerTypes);
      
      const [customer] = await db.insert(customers).values({
        customerName: customerNames[i],
        customerNumber: `CUST${String(i + 1).padStart(4, '0')}`,
        status: "active",
        customerType,
        customerLegalName: `${customerNames[i]} LLC`,
        customerAddress: generateAddress(),
        customerCity: cities[cityIndex],
        customerState: states[cityIndex],
        customerZip: `${30000 + Math.floor(Math.random() * 50000)}`,
        implementationDate: formatDateString(randomDate(new Date(2021, 0, 1), new Date(2024, 0, 1))),
        primaryContactName: `${randomElement(firstNames)} ${randomElement(lastNames)}`,
        primaryContactNumber: generatePhone(),
        primaryContactEmail: `contact@${customerNames[i].toLowerCase().replace(/\s+/g, '')}.com`,
      }).returning();
      
      if (customer) {
        createdCustomers.push(customer);
      }
    }
    console.log(`Created ${createdCustomers.length} customers`);

    // Create 10 Drivers
    console.log("Creating drivers...");
    const createdDrivers = [];
    for (let i = 0; i < driverUserIds.length; i++) {
      const cityIndex = i % cities.length;
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      
      const [driver] = await db.insert(drivers).values({
        userId: driverUserIds[i],
        email: `driver${i + 1}@test.com`,
        firstName,
        lastName,
        phoneNumber: generatePhone(),
        address: generateAddress(),
        city: cities[cityIndex],
        state: states[cityIndex],
        zipCode: `${30000 + Math.floor(Math.random() * 50000)}`,
        dateOfBirth: formatDateString(randomDate(new Date(1970, 0, 1), new Date(2000, 0, 1))),
        driverNumber: `DRV${String(i + 1).padStart(4, '0')}`,
        driverType: randomElement(["DriverShift", "DriverDash", "Hybrid"]),
        driverClassification: randomElement(["Employee", "Independent Contractor"]),
        market: markets[cityIndex],
        hireDate: formatDateString(randomDate(new Date(2020, 0, 1), new Date(2024, 0, 1))),
        licenseNumber: `DL${Math.floor(Math.random() * 900000000) + 100000000}`,
        licenseState: states[cityIndex],
        licenseExpiration: formatDateString(randomDate(new Date(2025, 0, 1), new Date(2028, 0, 1))),
        status: "active",
        safetyScore: randomElement(["Green", "Yellow", "Red"]),
        lifetimeMoveCount: Math.floor(Math.random() * 500) + 50,
        currentMonthMoveCount: Math.floor(Math.random() * 30),
        lastMonthMoveCount: Math.floor(Math.random() * 25),
      }).returning();
      
      if (driver) {
        createdDrivers.push(driver);
      }
    }
    console.log(`Created ${createdDrivers.length} drivers`);

    // Create 100 Trips
    console.log("Creating trips...");
    const originCities = ["Miami, FL", "Fort Lauderdale, FL", "Dallas, TX", "Houston, TX", "Tulsa, OK", "Raleigh, NC", "Orlando, FL", "Austin, TX", "San Antonio, TX", "Tampa, FL"];
    const destinationCities = ["Atlanta, GA", "Jacksonville, FL", "New Orleans, LA", "Nashville, TN", "Charlotte, NC", "Oklahoma City, OK", "Birmingham, AL", "Memphis, TN", "Little Rock, AR", "Baton Rouge, LA"];
    
    let tripsCreated = 0;
    for (let i = 0; i < 100; i++) {
      const driver = randomElement(createdDrivers);
      const customer = randomElement(createdCustomers);
      const tripDate = randomDate(new Date(2024, 0, 1), new Date());
      const distance = (Math.random() * 300 + 20).toFixed(2);
      const billRate = (Math.random() * 200 + 50).toFixed(2);
      const payRate = (parseFloat(billRate) * 0.65).toFixed(2);
      
      try {
        await db.insert(trips).values({
          moveNumber: `MV${String(i + 1).padStart(6, '0')}`,
          driverId: driver.id,
          customerId: customer.id,
          tripDate,
          origin: randomElement(originCities),
          destination: randomElement(destinationCities),
          distance,
          duration: `${Math.floor(Math.random() * 5) + 1}h ${Math.floor(Math.random() * 59)}m`,
          status: randomElement(tripStatuses),
          moveType: randomElement(moveTypes),
          vehicleType: randomElement(vehicleTypes),
          billRate,
          payRate,
          grossProfit: (parseFloat(billRate) - parseFloat(payRate)).toFixed(2),
          notes: Math.random() > 0.7 ? "Delivered on time, no issues." : null,
        });
        tripsCreated++;
      } catch (err) {
        // Skip duplicate move numbers
      }
    }
    console.log(`Created ${tripsCreated} trips`);

    console.log("\n✓ Seed complete!");
    console.log(`  - ${createdEmployees.length} Employees`);
    console.log(`  - ${createdCustomers.length} Customers`);
    console.log(`  - ${createdDrivers.length} Drivers`);
    console.log(`  - ${tripsCreated} Trips`);

  } catch (error) {
    console.error("Seed error:", error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
