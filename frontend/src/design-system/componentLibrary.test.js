import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PrimaryButton,
  SecondaryButton,
  OutlinedButton,
  TextButton,
  IconButton,
  FloatingActionButton,
  StatCard,
  EarningsCard,
  WalletCard,
  SupportCard,
  DriverCard,
  OnlineStatus,
  ApprovalStatus,
  DocumentStatus,
  TripStatus,
  RideStatus,
  ProgressIndicator,
  Badge,
  StatusChip,
  TextInput,
  PhoneInput,
  OTPInput,
  Dropdown,
  SegmentedControl,
  Switch,
  Checkbox,
  RadioButton,
  ProfileHeader,
  InfoRow,
  SectionHeader,
  ActionRow,
  QuickActionTile,
  LoadingSkeleton,
  EmptyState,
  OfflineState,
  ErrorState,
  RetryView,
  PermissionDenied,
  ConfirmationDialog,
  Modal,
  Toast,
  ActionSheet,
  TopAppBar,
  BottomNavigation,
  ScreenContainer,
  ScrollablePage,
  StickyFooter,
  FloatingActionArea,
  ThemeProvider,
} from "./index";

function setRootAttrs({ theme = "light", dir = "ltr" } = {}) {
  document.documentElement.setAttribute("data-yala-theme", theme);
  document.documentElement.setAttribute("dir", dir);
}

describe("YALA Mission 3 component library", () => {
  beforeEach(() => {
    setRootAttrs();
  });

  describe("buttons", () => {
    it("renders variants and loading/disabled states", () => {
      const { rerender } = render(<PrimaryButton>Save</PrimaryButton>);
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

      rerender(<SecondaryButton disabled>Cancel</SecondaryButton>);
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

      rerender(<OutlinedButton isLoading>Loading</OutlinedButton>);
      expect(screen.getByRole("button", { name: "Loading" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Loading" })).toHaveAttribute("aria-busy", "true");

      rerender(<TextButton fullWidth>Text</TextButton>);
      expect(screen.getByRole("button", { name: "Text" }).className).toMatch(/yds-btn--block/);

      rerender(<IconButton aria-label="More" icon="⋯" />);
      expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

      rerender(<FloatingActionButton aria-label="Create" icon="+" />);
      expect(screen.getByRole("button", { name: "Create" }).className).toMatch(/yds-btn--fab/);
    });
  });

  describe("cards and status", () => {
    it("renders domain cards and semantic status chips", () => {
      render(
        <>
          <DriverCard title="Driver">Body</DriverCard>
          <StatCard label="Trips" value="12" />
          <EarningsCard amount="4,800 MRU" period="Today" />
          <WalletCard balance="1,200 MRU" />
          <SupportCard title="Help" description="Contact support" />
          <OnlineStatus online />
          <ApprovalStatus status="approved" />
          <DocumentStatus status="under_review" />
          <TripStatus status="in_progress" />
          <RideStatus status="completed" />
          <StatusChip intent="success">OK</StatusChip>
          <Badge label="Alerts">2</Badge>
          <ProgressIndicator value={40} label="Progress" />
        </>
      );

      expect(screen.getByText("4,800 MRU")).toBeInTheDocument();
      expect(screen.getByText("Online")).toBeInTheDocument();
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Under review")).toBeInTheDocument();
      expect(screen.getByText("In progress")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByLabelText("Alerts")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    });
  });

  describe("inputs", () => {
    it("supports validation styling and interactive controls", () => {
      const onSegment = jest.fn();
      const onSwitch = jest.fn();
      const onOtp = jest.fn();

      render(
        <>
          <TextInput label="Name" error="Required" />
          <PhoneInput label="Phone" value="+222" onChange={() => {}} />
          <OTPInput value="12" onChange={onOtp} />
          <Dropdown
            label="City"
            value="a"
            onChange={() => {}}
            options={[
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ]}
          />
          <SegmentedControl
            label="Mode"
            value="ride"
            onChange={onSegment}
            options={[
              { value: "ride", label: "Ride" },
              { value: "delivery", label: "Delivery" },
            ]}
          />
          <Switch label="Online" checked={false} onChange={onSwitch} />
          <Checkbox label="Accept" checked={false} onChange={() => {}} />
          <RadioButton name="pay" value="cash" label="Cash" checked onChange={() => {}} />
        </>
      );

      expect(screen.getByText("Required")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
      expect(onSegment).toHaveBeenCalledWith("delivery");
      fireEvent.click(screen.getByRole("switch", { name: "Online" }));
      expect(onSwitch).toHaveBeenCalledWith(true);
      fireEvent.change(screen.getByLabelText("Digit 3"), { target: { value: "9" } });
      expect(onOtp).toHaveBeenCalled();
    });
  });

  describe("profile and states", () => {
    it("renders profile primitives and state views", () => {
      render(
        <>
          <ProfileHeader name="Amadou Driver" subtitle="Gold" />
          <InfoRow label="Phone" value="+222" />
          <SectionHeader title="Account" />
          <ActionRow title="Documents" />
          <QuickActionTile title="Support" />
          <LoadingSkeleton lines={2} />
          <EmptyState title="Empty" />
          <OfflineState title="Offline" />
          <ErrorState title="Broken" />
          <RetryView title="Retry me" onRetry={() => {}} />
          <PermissionDenied title="Denied" />
        </>
      );

      expect(screen.getByText("Amadou Driver")).toBeInTheDocument();
      expect(screen.getByText("Phone")).toBeInTheDocument();
      expect(screen.getByText("Empty")).toBeInTheDocument();
      expect(screen.getByText("Offline")).toBeInTheDocument();
      expect(screen.getByText("Broken")).toBeInTheDocument();
      expect(screen.getByText("Retry me")).toBeInTheDocument();
      expect(screen.getByText("Denied")).toBeInTheDocument();
      expect(screen.getByText("Loading")).toBeInTheDocument();
    });
  });

  describe("overlays and navigation", () => {
    it("renders dialogs, toast, sheets, and navigation shell", () => {
      const onConfirm = jest.fn();
      render(
        <>
          <ConfirmationDialog open title="Confirm?" onConfirm={onConfirm} onCancel={() => {}}>
            Body
          </ConfirmationDialog>
          <Toast message="Saved" intent="success" />
          <ActionSheet
            open
            title="Actions"
            onClose={() => {}}
            actions={[{ label: "Share", onClick: () => {} }]}
          />
          <ScreenContainer>
            <TopAppBar title="Home" />
            <ScrollablePage>Page</ScrollablePage>
            <StickyFooter>Footer</StickyFooter>
            <FloatingActionArea>
              <IconButton aria-label="Fab" icon="+" />
            </FloatingActionArea>
            <BottomNavigation
              items={[{ key: "home", label: "Home" }]}
              active="home"
              onChange={() => {}}
            />
          </ScreenContainer>
        </>
      );

      expect(screen.getAllByRole("dialog").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Saved")).toBeInTheDocument();
      expect(screen.getByText("Share")).toBeInTheDocument();
      expect(screen.getByText("Footer")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      expect(onConfirm).toHaveBeenCalled();
    });

    it("renders Modal alias", () => {
      render(<Modal open title="Modal title">Content</Modal>);
      expect(screen.getByText("Modal title")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("theme, RTL, and responsive tokens", () => {
    it("switches theme attributes and supports RTL via ThemeProvider", () => {
      render(
        <ThemeProvider defaultTheme="dark" defaultLang="ar" app="driver">
          <PrimaryButton>موافق</PrimaryButton>
          <OnlineStatus online={false} />
        </ThemeProvider>
      );

      expect(document.documentElement.getAttribute("data-yala-theme")).toBe("dark");
      expect(document.documentElement.getAttribute("dir")).toBe("rtl");
      expect(document.documentElement.getAttribute("data-yala-app")).toBe("driver");
      expect(screen.getByRole("button", { name: "موافق" })).toBeInTheDocument();
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    it("keeps full-width buttons usable on narrow layouts", () => {
      render(<PrimaryButton fullWidth>Continue</PrimaryButton>);
      const button = screen.getByRole("button", { name: "Continue" });
      expect(button.className).toMatch(/yds-btn--block/);
      expect(button.className).toMatch(/yds-btn--primary/);
    });
  });
});
