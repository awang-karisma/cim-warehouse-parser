import { createMemo, createSignal, type JSX, Show } from 'solid-js';
import {
  IconAlertCircle,
  IconCheck,
  IconCpu,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
} from '@tabler/icons-solidjs';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { useI18n } from '~/i18n';
import type { DataloggerDeviceSession } from './device-session';
import { isWebHidSupported } from './elitech-hid';
import { formatDateTimeFull } from './format';

export interface DeviceConnectSectionProps {
  device: DataloggerDeviceSession;
  title?: string;
  description?: string;
  externalError?: string | null;
  busy?: boolean;
  displayTimeoutCode?: number | null;
  onBeforeConnect?: () => void;
  onBeforeDisconnect?: () => void;
  alerts?: JSX.Element;
  actions?: JSX.Element;
  children?: JSX.Element;
}

export function DeviceConnectSection(props: DeviceConnectSectionProps) {
  const { t } = useI18n();
  const hidSupported = isWebHidSupported();
  const [confirmDismissPendingOpen, setConfirmDismissPendingOpen] = createSignal(false);

  const handleConnect = async () => {
    props.onBeforeConnect?.();
    await props.device.connect();
  };

  const handleDisconnect = async () => {
    props.onBeforeDisconnect?.();
    await props.device.disconnect();
  };

  const progressPercent = createMemo(() => {
    const prog = props.device.deviceProgress();
    if (!prog || prog.total <= 0) return 0;
    return Math.min(100, Math.round((prog.fetched / prog.total) * 100));
  });

  return (
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-1">
            <CardTitle class="flex items-center gap-2">
              <IconCpu class="size-5 text-muted-foreground" />
              {props.title ?? t('dataloggerConfig.connectionTitle')}
            </CardTitle>
            <CardDescription>
              {props.description ?? t('dataloggerConfig.connectionDesc')}
            </CardDescription>
          </div>
          <Badge variant={props.device.connected() ? 'success' : 'secondary'}>
            {props.device.connected()
              ? t('dataloggerConfig.connected')
              : t('dataloggerConfig.disconnected')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <Show when={!hidSupported}>
          <Alert>
            <IconAlertCircle class="size-4" />
            <AlertTitle>{t('dataloggerConfig.webHidUnavailableTitle')}</AlertTitle>
            <AlertDescription>{t('dataloggerConfig.webHidUnavailableDesc')}</AlertDescription>
          </Alert>
        </Show>

        <Show when={props.device.pendingVerification()}>
          {(pending) => (
            <Alert variant="destructive">
              <IconAlertCircle class="size-4" />
              <AlertTitle>{t('dataloggerConfig.pendingVerificationTitle')}</AlertTitle>
              <AlertDescription class="space-y-3">
                <div class="text-sm font-medium">{pending().statusMessage}</div>
                <div class="font-mono text-xs">
                  {t('dataloggerConfig.targetSerialLabel')}: {pending().receipt.serialNumber}
                </div>
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void props.device.verifyPendingOperation()}
                    disabled={props.device.deviceBusy()}
                  >
                    <IconRefresh class="size-3.5" />
                    {props.device.deviceBusy()
                      ? t('dataloggerConfig.verifyingBtn')
                      : t('dataloggerConfig.verifyNowBtn')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmDismissPendingOpen(true)}
                    disabled={props.device.deviceBusy()}
                  >
                    {t('dataloggerConfig.dismissUnverifiedBtn')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </Show>

        <Show
          when={
            !props.device.pendingVerification() &&
            props.device.lastVerifiedOperation() &&
            props.device.deviceInfo()
          }
        >
          <Alert>
            <IconCheck class="size-4 text-status-selesai" />
            <AlertDescription class="text-sm font-medium">
              {props.device.lastVerifiedOperation() === 'apply'
                ? t('dataloggerConfig.verifiedApplySuccess', {
                    serial: props.device.deviceInfo()?.serialNumber ?? '',
                  })
                : t('dataloggerConfig.verifiedQuickResetSuccess', {
                    serial: props.device.deviceInfo()?.serialNumber ?? '',
                  })}
            </AlertDescription>
          </Alert>
        </Show>

        <Show
          when={
            (props.externalError || props.device.deviceError()) &&
            !props.device.pendingVerification()
          }
        >
          <Alert variant="destructive">
            <IconAlertCircle class="size-4" />
            <AlertTitle>{t('dataloggerConfig.deviceErrorTitle')}</AlertTitle>
            <AlertDescription>{props.externalError ?? props.device.deviceError()}</AlertDescription>
          </Alert>
        </Show>

        <Show when={props.alerts}>{props.alerts}</Show>

        <div class="flex flex-wrap items-center gap-2">
          <Show
            when={!props.device.connected()}
            fallback={
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={props.device.deviceBusy() || props.busy}
              >
                <IconPlugConnectedX class="size-4" />
                {t('dataloggerConfig.disconnect')}
              </Button>
            }
          >
            <Button
              onClick={handleConnect}
              disabled={!hidSupported || props.device.deviceBusy() || props.busy}
            >
              <IconPlugConnected class="size-4" />
              {props.device.deviceBusy()
                ? t('dataloggerConfig.connecting')
                : t('dataloggerConfig.connectDevice')}
            </Button>
          </Show>

          <Show when={props.actions}>{props.actions}</Show>
        </div>

        <Show when={props.device.deviceInfo()}>
          {(info) => (
            <div class="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <div class="text-xs text-muted-foreground">{t('dataloggerConfig.modelLabel')}</div>
                <div class="text-sm font-medium">{info().modelName}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">{t('dataloggerConfig.serialLabel')}</div>
                <div class="font-mono text-sm font-medium">{info().serialNumber}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.storedRecordsLabel')}
                </div>
                <div class="font-mono text-sm font-medium tabular-nums">
                  {info().recordNumber.toLocaleString()} / {info().deviceCapacity.toLocaleString()}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.currentIntervalLabel')}
                </div>
                <div class="font-mono text-sm font-medium">{info().intervalFormatted}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.firmwareProtocolLabel')}
                </div>
                <div class="font-mono text-sm font-medium">
                  v{info().firmwareVersion} / 0x{info().protocolVersion.toString(16).toUpperCase()}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">{t('dataloggerConfig.batteryLabel')}</div>
                <div class="font-mono text-sm font-medium">{info().batteryLevel}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">{t('dataloggerConfig.unitLabel')}</div>
                <div class="font-mono text-sm font-medium">{info().temperatureUnit}</div>
              </div>
              <Show when={props.displayTimeoutCode !== undefined}>
                <div>
                  <div class="text-xs text-muted-foreground">
                    {t('dataloggerConfig.lcdRawCodeLabel')}
                  </div>
                  <div class="font-mono text-sm font-medium">
                    {props.displayTimeoutCode !== null
                      ? `0x${props.displayTimeoutCode!.toString(16).toUpperCase()}`
                      : '—'}
                  </div>
                </div>
              </Show>
              <div
                class={
                  props.displayTimeoutCode !== undefined
                    ? 'col-span-2'
                    : 'col-span-2 sm:col-span-2 lg:col-span-3'
                }
              >
                <div class="text-xs text-muted-foreground">
                  {t('dataloggerConfig.deviceClockLabel')}
                </div>
                <div class="font-mono text-sm font-medium">
                  {formatDateTimeFull(info().deviceTime)}
                </div>
              </div>
            </div>
          )}
        </Show>

        <Show when={props.device.deviceProgress() && props.device.deviceProgress()!.total > 0}>
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('datalogger.import.readingProgress')}</span>
              <span class="font-mono tabular-nums">
                {props.device.deviceProgress()!.fetched.toLocaleString()} /{' '}
                {props.device.deviceProgress()!.total.toLocaleString()} ({progressPercent()}%)
              </span>
            </div>
            <Progress value={progressPercent()} />
          </div>
        </Show>

        <Show when={props.children}>{props.children}</Show>
      </CardContent>

      <AlertDialog
        open={confirmDismissPendingOpen()}
        onOpenChange={setConfirmDismissPendingOpen}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {t('dataloggerConfig.dismissConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('dataloggerConfig.dismissConfirmDesc', {
              serial:
                props.device.pendingVerification()?.receipt.serialNumber ?? '—',
            })}
          </AlertDialogDescription>
          <AlertDialogFooter class="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDismissPendingOpen(false)}
            >
              {t('dataloggerConfig.cancelBtn')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDismissPendingOpen(false);
                props.device.dismissPendingVerification();
              }}
            >
              {t('dataloggerConfig.dismissUnverifiedBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
