import React from "react";
import { render, screen } from "@testing-library/react";
import {
  Badge,
  ErrorState,
  Grid,
  Icon,
  LoadingState,
  OfflineState,
  NoDataState,
  Page,
  Progress,
  Stack,
  iconNames,
  componentTokens,
  themes,
  typography,
} from "./index";

describe("YALA unified design system", () => {
  it("exports accessible state and progress primitives", () => {
    render(
      <Page>
        <LoadingState title="Loading trips" />
        <OfflineState title="Connection unavailable" />
        <NoDataState title="No trips available" />
        <Progress value={25} label="Trip completion" />
        <ErrorState title="Unable to load" />
        <Badge label="3 notifications">3</Badge>
      </Page>
    );

    expect(screen.getByText("Loading trips")).toBeInTheDocument();
    expect(screen.getByText("Connection unavailable")).toBeInTheDocument();
    expect(screen.getByText("No trips available")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");
    expect(screen.getByLabelText("3 notifications")).toBeInTheDocument();
  });

  it("provides shared responsive layout and ecosystem icon primitives", () => {
    render(
      <Stack>
        <Grid columns="2">
          <Icon name="trips" />
          <Icon name="delivery" />
        </Grid>
      </Stack>
    );

    expect(iconNames).toEqual(
      expect.arrayContaining([
        "trips",
        "vehicle",
        "delivery",
        "wallet",
        "history",
        "support",
        "settings",
        "notifications",
        "profile",
        "navigation",
        "documents",
      ])
    );
  });

  it("exposes accessible, localized theme foundations", () => {
    expect(componentTokens.minimumTouchTarget).toBe(48);
    expect(typography.body.size).toBe(16);
    expect(themes.light.textPrimary).toBe("#0f172a");
    expect(themes.dark.textPrimary).toBe("#f8fafc");
    expect(iconNames).toContain("emergency");
  });
});
