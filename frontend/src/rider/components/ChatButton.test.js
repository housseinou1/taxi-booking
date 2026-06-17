import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatButton from './ChatButton';

describe('ChatButton component', () => {
  it('renders with Chat with driver aria-label when no unread messages', () => {
    render(<ChatButton onClick={() => {}} />);
    expect(screen.getByLabelText('Chat with driver')).toBeInTheDocument();
  });

  it('renders the Chat label text', () => {
    render(<ChatButton onClick={() => {}} />);
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('calls onClick when tapped', () => {
    const handleClick = jest.fn();
    render(<ChatButton onClick={handleClick} />);
    fireEvent.click(screen.getByLabelText('Chat with driver'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has minimum 44px tap target via CSS class', () => {
    const { container } = render(<ChatButton onClick={() => {}} />);
    const button = container.querySelector('.chat-button');
    expect(button).toBeInTheDocument();
  });

  it('does not show badge when unreadCount is 0', () => {
    const { container } = render(<ChatButton onClick={() => {}} unreadCount={0} />);
    const badge = container.querySelector('.chat-button__badge');
    expect(badge).not.toBeInTheDocument();
  });

  it('does not show badge when unreadCount is not provided', () => {
    const { container } = render(<ChatButton onClick={() => {}} />);
    const badge = container.querySelector('.chat-button__badge');
    expect(badge).not.toBeInTheDocument();
  });

  it('shows badge with unread count when unreadCount > 0', () => {
    const { container } = render(<ChatButton onClick={() => {}} unreadCount={3} />);
    const badge = container.querySelector('.chat-button__badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
  });

  it('shows 99+ when unreadCount exceeds 99', () => {
    const { container } = render(<ChatButton onClick={() => {}} unreadCount={150} />);
    const badge = container.querySelector('.chat-button__badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('99+');
  });

  it('updates aria-label with unread count for singular message', () => {
    render(<ChatButton onClick={() => {}} unreadCount={1} />);
    expect(
      screen.getByLabelText('Chat with driver, 1 unread message')
    ).toBeInTheDocument();
  });

  it('updates aria-label with unread count for plural messages', () => {
    render(<ChatButton onClick={() => {}} unreadCount={5} />);
    expect(
      screen.getByLabelText('Chat with driver, 5 unread messages')
    ).toBeInTheDocument();
  });

  it('renders with button type="button"', () => {
    render(<ChatButton onClick={() => {}} />);
    const button = screen.getByLabelText('Chat with driver');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies additional className if provided', () => {
    const { container } = render(
      <ChatButton onClick={() => {}} className="extra" />
    );
    const button = container.querySelector('.chat-button');
    expect(button).toHaveClass('chat-button');
    expect(button).toHaveClass('extra');
  });

  it('renders the chat icon with aria-hidden', () => {
    const { container } = render(<ChatButton onClick={() => {}} />);
    const icon = container.querySelector('.chat-button__icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
