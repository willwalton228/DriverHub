import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { User, DollarSign, MapPin, FileText, LogOut, Menu, Clock, Shield, MessageSquarePlus, ListTodo, CalendarDays, Users } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DriverLayoutProps {
  children: React.ReactNode;
}

export function DriverLayout({ children }: DriverLayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const navItems = [
    { href: "/", label: "Home", icon: User },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/status", label: "My Status", icon: Shield },
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/pay", label: "Pay Data", icon: DollarSign },
    { href: "/trips", label: "Trips", icon: MapPin },
    { href: "/time-clock", label: "Time Clock", icon: Clock },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/referrals", label: "My Referrals", icon: Users },
    { href: "/my-feedback", label: "My Feedback", icon: MessageSquarePlus },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/">
                <a className="flex items-center gap-2" data-testid="link-home-logo">
                  <Logo variant="icon" className="h-8 w-8" />
                  <div className="hidden sm:flex flex-col">
                    <span className="text-base font-semibold text-foreground leading-tight">DriverHub</span>
                    <span className="text-sm font-semibold text-primary leading-tight">360</span>
                  </div>
                </a>
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <a>
                      <Button
                        variant={location === item.href ? "secondary" : "ghost"}
                        size="sm"
                        data-testid={`nav-link-${item.label.toLowerCase().replace(" ", "-")}`}
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </Button>
                    </a>
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <NotificationBell />
              <ThemeToggle />
              
              <div className="hidden md:flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2" data-testid="button-user-menu">
                      <UserAvatar
                        photoUrl={user?.profileImageUrl}
                        firstName={user?.firstName}
                        lastName={user?.lastName}
                        email={user?.email}
                        size="xs"
                        className="h-7 w-7"
                      />
                      <span className="hidden lg:inline">
                        {user?.firstName || user?.email?.split("@")[0] || "Driver"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <Link href="/profile">
                      <DropdownMenuItem data-testid="menu-item-profile">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="md:hidden">
                <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {navItems.map((item) => (
                      <Link key={item.href} href={item.href}>
                        <DropdownMenuItem
                          onClick={() => setMobileMenuOpen(false)}
                          data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                        >
                          <item.icon className="mr-2 h-4 w-4" />
                          {item.label}
                        </DropdownMenuItem>
                      </Link>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} data-testid="mobile-menu-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
