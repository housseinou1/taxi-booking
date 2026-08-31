import React from "react";

import { AdminServerErrorPage } from "./AdminErrorPages";

export default class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info);
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <AdminServerErrorPage
          message={error?.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
