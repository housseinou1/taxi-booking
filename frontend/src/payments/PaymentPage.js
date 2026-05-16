import React from "react";

import { loadStripe } from "@stripe/stripe-js";

import {
  Elements,
} from "@stripe/react-stripe-js";

import CheckoutForm from "./CheckoutForm";

const stripePromise = loadStripe(
  "pk_test_51TTCkKJzbN9eR5NURYABK0D9iCzhkALfz42rWYv24RF6VeGKNkQdiuZFgdE2iHrLFkb3QI1CPXVXCWcMAElOig6d00RRbBkM0O"
);

function PaymentPage() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
}

export default PaymentPage;