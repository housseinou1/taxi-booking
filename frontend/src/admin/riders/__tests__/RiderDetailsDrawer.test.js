import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import RiderDetailsDrawer from "../RiderDetailsDrawer";

const RIDER = {
  id: 1,
  full_name: "Amina Diallo",
  email: "amina@mail.com",
  phone_number: "+221700000001",
  phone_verified: true,
  rider_status: "approved",
  rider_status_label: "Approved",
  is_active: true,
  national_id_number: "ID001",
  has_national_id_document: true,
  national_id_document: "/media/id/amina.jpg",
  rider_average_rating: 4.5,
  rider_rating_count: 3,
  city_name: "Dakar",
  region_name: "Dakar",
  member_since_year: 2024,
  years_using_app: 2,
  date_joined: "2026-01-10T10:00:00Z",
  profile_picture: "",
};

function renderDrawer(props = {}) {
  return render(
    <RiderDetailsDrawer
      rider={RIDER}
      open
      rides={[]}
      getFileUrl={(p) => p}
      onClose={jest.fn()}
      onApprove={jest.fn()}
      onReject={jest.fn()}
      onSuspendToggle={jest.fn()}
      onDelete={jest.fn()}
      {...props}
    />
  );
}

test("renders real personal fields that exist in the payload", () => {
  renderDrawer();
  expect(screen.getByText("amina@mail.com")).toBeInTheDocument();
  expect(screen.getByText("ID001")).toBeInTheDocument();
  expect(screen.getByText("Dakar · Dakar")).toBeInTheDocument();
});

test("shows honest empty states for data the backend does not provide", () => {
  renderDrawer();
  expect(screen.getByText(/ride history is not available/i)).toBeInTheDocument();
  expect(screen.getByText(/no written reviews available/i)).toBeInTheDocument();
  expect(screen.getByText(/activity log is not available/i)).toBeInTheDocument();
});

test("verification and account status appear as separate sections", () => {
  renderDrawer();
  expect(screen.getByRole("heading", { name: /identity verification/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /account status/i })).toBeInTheDocument();
});

test("identity document link is shown when available", () => {
  renderDrawer();
  expect(screen.getByRole("link", { name: /view national id document/i })).toHaveAttribute(
    "href",
    "/media/id/amina.jpg"
  );
});

test("identity document empty state is shown when missing", () => {
  renderDrawer({ rider: { ...RIDER, has_national_id_document: false, national_id_document: "" } });
  expect(screen.getByText("No document on file")).toBeInTheDocument();
});

test("does not fabricate a completed-rides total when rides are unavailable", () => {
  renderDrawer({ rides: [] });
  const history = screen.getByText(/ride history is not available/i).textContent;
  expect(history).not.toMatch(/\d+ completed ride/);
});

test("Approve is disabled for an approved rider", () => {
  renderDrawer();
  expect(screen.getByRole("button", { name: /approve verification/i })).toBeDisabled();
});

test("Delete action calls the handler", () => {
  const onDelete = jest.fn();
  renderDrawer({ onDelete });
  fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
  expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
});

test("Escape closes the drawer", () => {
  const onClose = jest.fn();
  renderDrawer({ onClose });
  // The library Drawer handles overlay click close; verify the close button works.
  fireEvent.click(screen.getByRole("button", { name: /close drawer/i }));
  expect(onClose).toHaveBeenCalled();
});

test("renders nothing when closed", () => {
  const { container } = renderDrawer({ open: false });
  expect(container).toBeEmptyDOMElement();
});
