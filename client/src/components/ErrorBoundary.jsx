import React from 'react';
import { Button, Result } from 'antd';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '50px', display: 'flex', justifyContent: 'center' }}>
          <Result
            status="500"
            title="Something went wrong"
            subTitle={this.state.error?.message || "Sorry, an unexpected error occurred."}
            extra={<Button type="primary" onClick={() => window.location.reload()}>Reload Page</Button>}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
