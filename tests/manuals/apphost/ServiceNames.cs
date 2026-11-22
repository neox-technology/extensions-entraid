namespace Neox.Extensions.EntraId.Manuals.AppHost;

public static class ServiceNames {

    public const string Prefix = "entra";

    public static class Auth {
        public const string Registration = $"{Prefix}-auth-app";
        public const string Spa = $"{Prefix}-auth-spa";
        public const string Web = $"{Prefix}-auth-web";
    }

    public static class Services {
        public const string Api = $"{Prefix}-services-api";
    }

    public static class Web {
        public const string Spa = $"{Prefix}-web-spa";
    }
}
