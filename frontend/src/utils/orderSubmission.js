export function getCustomerOrderErrorMessage(error) {
  const status = error?.response?.status;
  const backendMessage = error?.response?.data?.message;

  if (status === 404) {
    return 'This table QR code is no longer valid. Please scan the current QR code or ask a staff member for help.';
  }

  if (status === 400) {
    if (backendMessage === 'One or more menu items are unavailable.') {
      return 'One or more items are no longer available. Please return to your cart and update your selection.';
    }

    return 'Some order details are no longer valid. Please review your cart and payment method.';
  }

  if (!error?.response) {
    return 'We could not confirm whether your order was received. Please ask a staff member before trying again to avoid a duplicate order.';
  }

  return 'The order could not be confirmed right now. Please keep your cart and ask a staff member for help.';
}

export function getOrderSubmitButtonState(isSubmitting) {
  return {
    disabled: Boolean(isSubmitting),
    label: isSubmitting ? 'Confirming order…' : 'Confirm order',
  };
}

export async function submitOrderOnce({
  submissionLock,
  request,
  onPending,
  onSuccess,
  onError,
}) {
  if (submissionLock.current) {
    return false;
  }

  submissionLock.current = true;
  onPending(true);

  try {
    const order = await request();
    onSuccess(order);
    return true;
  } catch (error) {
    onError(getCustomerOrderErrorMessage(error));
    return false;
  } finally {
    submissionLock.current = false;
    onPending(false);
  }
}
