namespace Neox.Extensions.EntraId.Manuals.AppHost;

public static class Program {

    public static void Main(string[] args) {
        var builder = DistributedApplication.CreateBuilder(args);
        var subscriptionId = builder.AddParameter($"{ServiceNames.Auth.Registration}-subscription-id");
        var tenantId = builder.AddParameter($"{ServiceNames.Auth.Registration}-tenant-id");

        Auth.Configure(builder);
        Services.Configure(builder, tenantId, subscriptionId);
        Web.Configure(builder, tenantId);

        builder.Build().Run();
    }
}
