import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES, toE164 } from "@/lib/countries";
import { logBackendError, phoneSendMessage, phoneVerifyMessage } from "@/lib/backend-errors";
import { haptic } from "@/lib/chat-theme";
import { useT } from "@/lib/i18n";


const RESEND_DELAY = 60;

export function PhoneAuth({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState(COUNTRIES[0]!.code);
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const dial = useMemo(
    () => COUNTRIES.find((c) => c.code === country)?.dial ?? "+33",
    [country],
  );
  const phone = useMemo(() => toE164(dial, local), [dial, local]);
  const phoneValid = /^\+\d{8,15}$/.test(phone);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function sendCode(resend = false) {
    if (!phoneValid) {
      toast.error(t("auth.phone.invalidNumberTitle"), { description: t("auth.phone.invalidNumberDesc") });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      logBackendError("PHONE_AUTH_ERROR", error);
      toast.error(t("auth.phone.sendFailedTitle"), { description: phoneSendMessage(error) });
      return;
    }
    haptic();
    setStep("otp");
    setCode("");
    setCountdown(RESEND_DELAY);
    toast.success(resend ? t("auth.phone.newCodeSent") : t("auth.phone.codeSent"), {
      description: t("auth.phone.smsSentTo", { phone }),
    });
  }

  async function verifyCode(value: string) {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: value, type: "sms" });
    setLoading(false);
    if (error) {
      logBackendError("PHONE_OTP_ERROR", error);
      haptic();
      setCode("");
      toast.error(t("auth.phone.invalidCodeTitle"), { description: phoneVerifyMessage(error) });
      return;
    }
    onSuccess();
  }


  return (
    <div className="animate-rise">
      <button
        type="button"
        onClick={() => (step === "otp" ? setStep("phone") : onBack())}
        className="glass flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {step === "phone" ? (
        <div className="mt-8">
          <h2 className="text-3xl font-bold tracking-tight">{t("auth.phone.yourNumber")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.phone.subtitle")}
          </p>

          <div className="glass mt-8 flex items-center gap-2 rounded-3xl px-4 py-3">
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="max-w-[7.5rem] bg-transparent text-[15px] outline-none"
              aria-label={t("auth.phone.countryLabel")}
            >
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code} className="bg-background">
                  {item.flag} {item.dial}
                </option>
              ))}
            </select>
            <span className="h-6 w-px bg-border" />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={local}
              onChange={(event) => setLocal(event.target.value)}
              placeholder={t("auth.phone.numberPlaceholder")}
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          <button
            type="button"
            disabled={loading || !phoneValid}
            onClick={() => sendCode()}
            className="bg-brand shadow-glow mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-3xl text-base font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            {t("auth.phone.receiveCode")}
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <h2 className="text-3xl font-bold tracking-tight">{t("auth.phone.verificationCodeTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.phone.enterCodeSentTo")} <span className="text-foreground">{phone}</span>.
          </p>

          <OtpInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (next.length === 6) void verifyCode(next);
            }}
            disabled={loading}
          />

          <button
            type="button"
            disabled={loading || code.length !== 6}
            onClick={() => void verifyCode(code)}
            className="bg-brand shadow-glow mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-3xl text-base font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.phone.verify")}
          </button>

          <div className="mt-5 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="text-muted-foreground"
            >
              {t("auth.phone.editNumber")}
            </button>
            <button
              type="button"
              disabled={countdown > 0 || loading}
              onClick={() => void sendCode(true)}
              className="font-semibold text-foreground disabled:text-muted-foreground"
            >
              {countdown > 0 ? t("auth.phone.resendWithCountdown", { seconds: countdown }) : t("auth.phone.resend")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="relative mt-8"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label={t("auth.phone.codeInputLabel")}
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <div className="flex justify-between gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className={`glass flex h-14 flex-1 items-center justify-center rounded-2xl text-xl font-semibold transition-all duration-200 ${
              index === value.length ? "shadow-glow scale-[1.04]" : ""
            }`}
          >
            {value[index] ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}
