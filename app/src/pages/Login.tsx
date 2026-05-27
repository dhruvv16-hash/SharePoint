import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Lock,
  ArrowRight,
  Loader2,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function getOAuthUrl() {
  const authUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  if (!authUrl || !appID) {
    return null;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${authUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const oauthUrl = getOAuthUrl();

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("Logged in successfully");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
      setIsSubmitting(false);
    },
  });

  const signupMutation = trpc.localAuth.signup.useMutation({
    onSuccess: () => {
      toast.success("Account created successfully!");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (mode === "login") {
      loginMutation.mutate({ username, password });
    } else {
      if (!email || !username || !password) {
        toast.error("Please fill in all fields");
        setIsSubmitting(false);
        return;
      }
      signupMutation.mutate({
        username,
        email,
        password,
        displayName: displayName || username,
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 50%, rgba(0,229,255,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(96,239,255,0.15) 0%, transparent 50%)",
            }}
          />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-8">
            <Shield size={24} strokeWidth={1.5} />
            <span className="text-[18px] font-light tracking-[-0.3px]">SharedPoint</span>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-[36px] font-light tracking-[-0.5px] leading-[1.1] mb-4">
            Your permanent
            <br />
            digital vault.
          </h1>
          <p className="text-[14px] text-white/60 font-light leading-relaxed max-w-md">
            Store files safely, share them securely, recover mistakes, and keep access for years.
            Upload once, keep forever.
          </p>
        </div>

        <div className="relative z-10 flex gap-8 text-[12px] text-white/40">
          <span>Secure Storage</span>
          <span>Version Control</span>
          <span>Team Sharing</span>
          <span>AI Search</span>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-[360px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Shield size={20} strokeWidth={1.5} />
            <span className="text-[16px] font-light">SharedPoint</span>
          </div>

          <h2 className="text-[24px] font-light tracking-[-0.3px] mb-1">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-[13px] text-[#888888] mb-6">
            {mode === "login"
              ? "Sign in to your vault"
              : "Get started with your secure vault"}
          </p>

          {/* OAuth */}
          {oauthUrl ? (
            <a
              href={oauthUrl}
              className="w-full flex items-center justify-center gap-2 p-2.5 border border-[rgba(0,0,0,0.15)] rounded text-[13px] hover:bg-[#f8f8f8] transition-colors mb-4"
            >
              <Lock size={14} />
              Continue with OAuth
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 p-2.5 border border-[rgba(0,0,0,0.15)] rounded text-[13px] bg-[#f8f8f8] text-[#888888] cursor-not-allowed mb-4"
              title="OAuth is not configured"
            >
              <Lock size={14} />
              OAuth not configured
            </button>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
            <span className="text-[11px] text-[#888888]">or</span>
            <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
          </div>

          {/* Local Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px] mb-1 block">
                    Display Name
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="text-[12px] h-9"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px] mb-1 block">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="text-[12px] h-9"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px] mb-1 block">
                Username
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="text-[12px] h-9"
                required
              />
            </div>

            <div>
              <label className="text-[11px] text-[#888888] uppercase tracking-[0.5px] mb-1 block">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8 characters" : "Enter password"}
                  className="text-[12px] h-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-black"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white hover:bg-[#222] text-[12px] h-9 mt-2"
            >
              {isSubmitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : mode === "login" ? (
                <span className="flex items-center gap-1">
                  Sign In <ArrowRight size={12} />
                </span>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <p className="text-[12px] text-[#888888] text-center mt-4">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button onClick={() => setMode("signup")} className="text-black hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => setMode("login")} className="text-black hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
